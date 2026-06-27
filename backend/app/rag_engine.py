"""
RAG Engine for Veracity — Advanced Edition.

Upgrades over v1:
  1. Query rewriting  — GPT rewrites the user's question to improve retrieval
  2. Hybrid search    — ChromaDB vector search + BM25 keyword search merged via RRF
  3. Re-ranking       — GPT scores each retrieved chunk and sorts by relevance
  4. Grounded answer  — Final answer generated from top re-ranked chunks only

Collections:
  - "runs"       : Analysis results per upload
  - "csv_data"   : CSV sample rows
  - "knowledge"  : Static ITSM domain knowledge base
"""
import os
import json
import textwrap
import math
from typing import Optional

import chromadb

_CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")
_chroma_client: Optional[chromadb.PersistentClient] = None


def _get_chroma():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=_CHROMA_DIR)
    return _chroma_client


def _runs_col():    return _get_chroma().get_or_create_collection("runs")
def _csv_col():     return _get_chroma().get_or_create_collection("csv_data")
def _kb_col():      return _get_chroma().get_or_create_collection("knowledge")


# ── OpenAI helpers ────────────────────────────────────────────────────────────
def _openai():
    import openai
    return openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _embed(texts: list[str]) -> list[list[float]]:
    resp = _openai().embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in resp.data]


def _chat(messages: list[dict], max_tokens: int = 600, temperature: float = 0.2) -> str:
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    resp = _openai().chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return resp.choices[0].message.content.strip()


# ── Step 1: Query rewriting ───────────────────────────────────────────────────
def _rewrite_query(query: str) -> str:
    """
    Rewrite the user's question into a retrieval-optimised form.
    Expands abbreviations, adds domain context, makes it more specific.
    """
    try:
        rewritten = _chat([
            {"role": "system", "content": (
                "You are a search query optimizer for an ITSM/operations analytics tool. "
                "Rewrite the user's question to be more specific and retrieval-friendly. "
                "Expand abbreviations, add relevant ITSM terms, keep it concise. "
                "Return ONLY the rewritten query, nothing else."
            )},
            {"role": "user", "content": query},
        ], max_tokens=80, temperature=0.1)
        return rewritten if rewritten else query
    except Exception:
        return query


# ── Step 2: BM25 keyword search ───────────────────────────────────────────────
class _BM25:
    """Lightweight in-memory BM25 scorer (no external dependency)."""
    def __init__(self, corpus: list[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = corpus
        self.tokenized = [doc.lower().split() for doc in corpus]
        self.N = len(self.tokenized)
        self.avgdl = sum(len(d) for d in self.tokenized) / max(self.N, 1)
        self.df: dict[str, int] = {}
        for doc in self.tokenized:
            for term in set(doc):
                self.df[term] = self.df.get(term, 0) + 1

    def score(self, query: str) -> list[float]:
        tokens = query.lower().split()
        scores = []
        for doc in self.tokenized:
            s = 0.0
            doc_len = len(doc)
            tf_map: dict[str, int] = {}
            for t in doc:
                tf_map[t] = tf_map.get(t, 0) + 1
            for term in tokens:
                if term not in self.df:
                    continue
                tf = tf_map.get(term, 0)
                idf = math.log((self.N - self.df[term] + 0.5) / (self.df[term] + 0.5) + 1)
                numer = tf * (self.k1 + 1)
                denom = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
                s += idf * numer / denom
            scores.append(s)
        return scores


def _bm25_search(query: str, docs: list[str], top_k: int = 6) -> list[tuple[int, float]]:
    """Return [(index, score)] sorted by BM25 score descending."""
    if not docs:
        return []
    bm25 = _BM25(docs)
    scores = bm25.score(query)
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]


# ── Step 3: Reciprocal Rank Fusion ───────────────────────────────────────────
def _rrf(vector_ids: list[str], bm25_ids: list[str], k: int = 60) -> list[str]:
    """
    Merge two ranked lists using Reciprocal Rank Fusion.
    Returns deduplicated list of IDs ordered by combined relevance.
    """
    scores: dict[str, float] = {}
    for rank, doc_id in enumerate(vector_ids):
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
    for rank, doc_id in enumerate(bm25_ids):
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
    return sorted(scores, key=lambda x: scores[x], reverse=True)


# ── Step 4: Re-ranking ────────────────────────────────────────────────────────
def _rerank(query: str, chunks: list[dict]) -> list[dict]:
    """
    Ask GPT to score each chunk 0-10 for relevance to the query.
    Returns chunks sorted by score descending.
    Fast batched approach — one API call for all chunks.
    """
    if not chunks or len(chunks) <= 1:
        return chunks

    try:
        numbered = "\n\n".join(
            f"[{i+1}] {c['text'][:400]}" for i, c in enumerate(chunks)
        )
        prompt = (
            f"Query: {query}\n\n"
            f"Rate each passage's relevance to the query (0-10). "
            f"Return ONLY a JSON array of scores in order, e.g. [8, 3, 7, 2].\n\n"
            f"Passages:\n{numbered}"
        )
        raw = _chat(
            [{"role": "user", "content": prompt}],
            max_tokens=100, temperature=0,
        )
        scores = json.loads(raw)
        if isinstance(scores, list) and len(scores) == len(chunks):
            for i, chunk in enumerate(chunks):
                chunk["rerank_score"] = float(scores[i])
            return sorted(chunks, key=lambda x: x.get("rerank_score", 0), reverse=True)
    except Exception:
        pass

    return chunks


# ── Collection query helper ───────────────────────────────────────────────────
def _query_collection(col, query_embedding: list[float], n: int, where: Optional[dict] = None) -> list[dict]:
    """Query a ChromaDB collection and return list of {id, text, meta} dicts."""
    count = col.count()
    if count == 0:
        return []
    try:
        kwargs: dict = {"query_embeddings": [query_embedding], "n_results": min(n, count)}
        if where:
            kwargs["where"] = where
        results = col.query(**kwargs)
        out = []
        for doc, meta, doc_id in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["ids"][0],
        ):
            out.append({"id": doc_id, "text": doc, "meta": meta})
        return out
    except Exception:
        return []


# ── Document builders (same as before) ───────────────────────────────────────
def _run_to_documents(run_id: int, filename: str, analysis: dict) -> list[tuple[str, str]]:
    docs = []
    prefix = f"run_{run_id}"

    q = analysis.get("quality", {})
    p = analysis.get("profile", {})
    docs.append((f"{prefix}_quality", textwrap.dedent(f"""
        File: {filename}  |  Run ID: {run_id}
        Data quality score: {q.get('quality_score')}/100  Grade: {q.get('grade')}
        Rows: {p.get('rows')}  Columns: {p.get('columns')}
        Missing data: {q.get('missing_percentage')}%
        Duplicate rows: {p.get('duplicate_rows')}
        Issues: {'; '.join(q.get('issues', []))}
    """).strip()))

    opps = analysis.get("opportunities", {}).get("opportunities", [])
    if opps:
        opp_text = "\n".join(
            f"- {o.get('issue')} ({o.get('main_department')}, {o.get('ticket_count')} tickets, "
            f"{o.get('average_resolution_time')} hrs avg, {o.get('impact_level')} impact)"
            for o in opps[:20]
        )
        docs.append((f"{prefix}_opportunities",
                     f"File: {filename}  |  Run ID: {run_id}\nAutomation Opportunities:\n{opp_text}"))

    bn = analysis.get("bottlenecks", {}).get("bottlenecks", {})
    if bn:
        docs.append((f"{prefix}_bottlenecks",
                     f"File: {filename}  |  Run ID: {run_id}\n"
                     f"Slowest departments: {json.dumps(bn.get('slowest_departments', {}))}\n"
                     f"Bottleneck details: {json.dumps(bn)}"))

    ai = analysis.get("ai_advisor_report", {})
    if ai and ai.get("mode") != "rule_based_fallback":
        plan = ai.get("suggested_30_60_90_day_plan", {})
        docs.append((f"{prefix}_ai_report", textwrap.dedent(f"""
            File: {filename}  |  Run ID: {run_id}
            AI Executive Summary: {ai.get('executive_summary', '')}
            Leadership Message: {ai.get('leadership_message', '')}
            30-day plan: {plan.get('day_30', '')}
            60-day plan: {plan.get('day_60', '')}
            90-day plan: {plan.get('day_90', '')}
        """).strip()))

    clusters = analysis.get("ticket_clusters", {}).get("clusters", [])
    if clusters:
        cluster_text = "\n".join(
            f"- Cluster {c.get('cluster_id')}: {c.get('ticket_count')} tickets, "
            f"top terms: {', '.join(c.get('top_terms', [])[:5])}"
            for c in clusters
        )
        docs.append((f"{prefix}_clusters",
                     f"File: {filename}  |  Run ID: {run_id}\nTicket Clusters:\n{cluster_text}"))

    return docs


# ── Public API ────────────────────────────────────────────────────────────────
def embed_run_data(run_id: int, filename: str, analysis: dict):
    if not os.getenv("OPENAI_API_KEY"):
        return
    try:
        docs = _run_to_documents(run_id, filename, analysis)
        if not docs:
            return
        ids = [d[0] for d in docs]
        texts = [d[1] for d in docs]
        embeddings = _embed(texts)
        metadatas = [{"run_id": run_id, "filename": filename} for _ in docs]
        _runs_col().upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)
    except Exception as e:
        print(f"[RAG] embed_run_data failed: {e}")


def embed_csv_sample(run_id: int, filename: str, df_sample: str):
    if not os.getenv("OPENAI_API_KEY"):
        return
    try:
        text = f"File: {filename}  |  Run ID: {run_id}\nCSV Sample:\n{df_sample}"
        embeddings = _embed([text])
        _csv_col().upsert(
            ids=[f"csv_{run_id}"],
            embeddings=embeddings,
            documents=[text],
            metadatas=[{"run_id": run_id, "filename": filename}],
        )
    except Exception as e:
        print(f"[RAG] embed_csv_sample failed: {e}")


def seed_knowledge_base():
    if not os.getenv("OPENAI_API_KEY"):
        return
    knowledge_docs = [
        ("kb_sla_basics", textwrap.dedent("""
            ITSM SLA Best Practices:
            P1 (Critical): resolve within 1 hour, respond within 15 minutes
            P2 (High): resolve within 4 hours, respond within 30 minutes
            P3 (Medium): resolve within 24 hours, respond within 2 hours
            P4 (Low): resolve within 72 hours, respond within 8 hours
            SLA breach rate above 10% indicates a systemic bottleneck.
            Average resolution time above 48 hours across all priorities is a major risk.
        """)),
        ("kb_automation_roi", textwrap.dedent("""
            Automation ROI in ITSM:
            Password reset tickets: automatable in 2 weeks, saves 5-10 min per ticket
            Account unlock: self-service portal achieves 80%+ deflection
            Software provisioning: reduces avg 4hr tickets to under 10 minutes
            Incident triage: AI classification cuts routing time by 60-70%
            Typical ROI breakeven: 3-6 months for high-volume automations
            Rule of thumb: if a ticket type has more than 50 occurrences per month
            and under 30 min resolution time, it is automatable.
        """)),
        ("kb_data_quality_itsm", textwrap.dedent("""
            Data Quality Standards for ITSM Ticket Exports:
            Required fields: ticket_id, created_date, resolved_date, status, priority, department, category
            Missing priority: tickets cannot be triaged correctly, inflates P3/P4 backlog
            Missing resolution time: cannot calculate SLA compliance or team performance
            Duplicate tickets: inflate volume KPIs by 5-15% on average
            Acceptable missing rate: below 5% per critical field
            Quality score above 80 is production-grade. Below 60 requires remediation before automation.
        """)),
        ("kb_bottleneck_diagnosis", textwrap.dedent("""
            Diagnosing Operational Bottlenecks:
            If one department has more than 2x the avg resolution time: staffing or skill gap
            If P1 tickets resolve slower than P3: escalation path is broken
            If volume spikes Monday or Friday: workload leveling opportunity
            If same category has high volume AND high resolution time: automation target
            Bottleneck resolution playbook: identify, isolate root cause,
            pilot fix with small team, measure SLA impact, scale
        """)),
        ("kb_executive_reporting", textwrap.dedent("""
            Executive Reporting for Operations Intelligence:
            CFOs care about: cost per ticket, automation savings, headcount efficiency
            COOs care about: SLA compliance percentage, bottleneck departments, ticket backlog trends
            CIOs care about: data quality, system integration gaps, automation roadmap
            Key metrics to report: quality score, automation opportunity value in dollars,
            SLA breach rate, top 3 bottleneck departments, recommended 30/60/90 day actions
            Frame savings as annualised: monthly savings multiplied by 12 for board presentations
        """)),
        ("kb_clustering_insights", textwrap.dedent("""
            Interpreting Ticket Clustering Results:
            A cluster with more than 20% of total volume is a systemic pattern, not noise
            Clusters with high resolution time AND high ticket count are top automation priority
            Semantically similar clusters sharing top terms may indicate misrouting
            Singleton clusters with 1-2 tickets are outliers, do not build automation for them
            After clustering, map each cluster to a process owner for accountability
        """)),
    ]
    try:
        ids = [d[0] for d in knowledge_docs]
        texts = [d[1].strip() for d in knowledge_docs]
        embeddings = _embed(texts)
        metadatas = [{"source": "knowledge_base"} for _ in knowledge_docs]
        _kb_col().upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)
        print(f"[RAG] Seeded {len(knowledge_docs)} knowledge base documents")
    except Exception as e:
        print(f"[RAG] seed_knowledge_base failed: {e}")


# ── Main chat function (Advanced RAG) ─────────────────────────────────────────
def chat(query: str, run_id: Optional[int] = None, n_results: int = 6) -> dict:
    """
    Advanced RAG pipeline:
      1. Rewrite query for better retrieval
      2. Embed rewritten query
      3. Vector search (ChromaDB) + BM25 keyword search
      4. Merge with Reciprocal Rank Fusion
      5. Re-rank top chunks with GPT
      6. Generate grounded answer from top chunks

    Returns: {"answer": str, "sources": list[str], "rewritten_query": str}
    """
    if not os.getenv("OPENAI_API_KEY"):
        return {
            "answer": "RAG chat requires an OPENAI_API_KEY in your .env file.",
            "sources": [],
            "rewritten_query": query,
        }

    try:
        # ── 1. Query rewriting ────────────────────────────────────────────
        rewritten = _rewrite_query(query)
        print(f"[RAG] Original: '{query}' → Rewritten: '{rewritten}'")

        # ── 2. Embed rewritten query ──────────────────────────────────────
        q_embedding = _embed([rewritten])[0]

        # ── 3. Collect candidate chunks ───────────────────────────────────
        all_chunks: dict[str, dict] = {}  # id → chunk

        def _add_chunks(col, where=None, n=n_results):
            results = _query_collection(col, q_embedding, n, where)
            for c in results:
                all_chunks[c["id"]] = c

        # Run-specific first
        if run_id is not None:
            _add_chunks(_runs_col(), where={"run_id": run_id})
            _add_chunks(_csv_col(), where={"run_id": run_id})

        # Cross-run search
        _add_chunks(_runs_col(), n=n_results)

        # Knowledge base
        _add_chunks(_kb_col(), n=3)

        if not all_chunks:
            return {
                "answer": "No data indexed yet. Upload a CSV or connect Jira/Zendesk first.",
                "sources": [],
                "rewritten_query": rewritten,
            }

        chunk_list = list(all_chunks.values())
        docs_text = [c["text"] for c in chunk_list]

        # ── 4. BM25 keyword search + RRF ─────────────────────────────────
        # Vector ranking order (already sorted by similarity from ChromaDB)
        vector_ids = [c["id"] for c in chunk_list]

        # BM25 ranking
        bm25_ranked = _bm25_search(rewritten, docs_text, top_k=len(docs_text))
        bm25_ids = [chunk_list[idx]["id"] for idx, _ in bm25_ranked]

        # Merge with RRF
        merged_ids = _rrf(vector_ids, bm25_ids)
        merged_chunks = [all_chunks[cid] for cid in merged_ids if cid in all_chunks]

        # Take top candidates for re-ranking
        top_candidates = merged_chunks[:8]

        # ── 5. Re-rank with GPT ───────────────────────────────────────────
        reranked = _rerank(rewritten, top_candidates)

        # Use top 4 chunks for answer generation
        final_chunks = reranked[:4]

        # ── 6. Generate grounded answer ───────────────────────────────────
        context = "\n\n---\n\n".join(c["text"] for c in final_chunks)

        answer = _chat([
            {"role": "system", "content": (
                "You are Veracity AI, an expert operations intelligence assistant. "
                "Answer questions about ticket data, bottlenecks, automation opportunities, "
                "and data quality based ONLY on the provided context. "
                "Be specific, concise, and business-focused. "
                "If the context doesn't have enough information, say so clearly. "
                "Never invent numbers or facts not present in the context."
            )},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"},
        ], max_tokens=600)

        # Build source labels
        sources = []
        for c in final_chunks:
            meta = c.get("meta", {})
            if meta.get("source") == "knowledge_base":
                sources.append("Veracity Knowledge Base")
            else:
                sources.append(f"Run #{meta.get('run_id')} – {meta.get('filename', '')}")
        unique_sources = list(dict.fromkeys(sources))

        return {
            "answer": answer,
            "sources": unique_sources,
            "rewritten_query": rewritten,
        }

    except Exception as e:
        return {"answer": f"Chat error: {str(e)}", "sources": [], "rewritten_query": query}
