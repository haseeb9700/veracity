"""
RAG Engine for Veracity.

Manages three ChromaDB collections:
  - "runs"       : Analysis results per upload (opportunities, bottlenecks, AI report, etc.)
  - "csv_data"   : Sample rows + column stats from each CSV upload
  - "knowledge"  : Static ITSM/ops domain knowledge base

On upload  → embed_run_data() is called with all analysis results
On chat    → retrieve relevant chunks → generate grounded answer via OpenAI
"""
import os
import json
import textwrap
from typing import Optional

import chromadb
from chromadb.config import Settings

# ── ChromaDB client (persistent local store) ─────────────────────────────────
_CHROMA_DIR = os.getenv("CHROMA_DIR", "./chroma_db")
_chroma_client: Optional[chromadb.PersistentClient] = None


def _get_chroma():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=_CHROMA_DIR)
    return _chroma_client


def _runs_collection():
    return _get_chroma().get_or_create_collection("runs")


def _csv_collection():
    return _get_chroma().get_or_create_collection("csv_data")


def _knowledge_collection():
    return _get_chroma().get_or_create_collection("knowledge")


# ── OpenAI embedding helper ──────────────────────────────────────────────────
def _embed(texts: list[str]) -> list[list[float]]:
    """Return embeddings using OpenAI text-embedding-3-small."""
    import openai
    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    return [item.embedding for item in response.data]


# ── Document builders ────────────────────────────────────────────────────────
def _run_to_documents(run_id: int, filename: str, analysis: dict) -> list[tuple[str, str]]:
    """
    Convert analysis results into (doc_id, text) pairs for embedding.
    Each logical section becomes its own chunk for precise retrieval.
    """
    docs = []
    prefix = f"run_{run_id}"

    # Quality + profile
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

    # Opportunities
    opps = analysis.get("opportunities", {}).get("opportunities", [])
    if opps:
        opp_text = "\n".join(
            f"- {o.get('issue')} ({o.get('main_department')}, {o.get('ticket_count')} tickets, "
            f"{o.get('average_resolution_time')} hrs avg, {o.get('impact_level')} impact)"
            for o in opps[:20]
        )
        docs.append((f"{prefix}_opportunities", f"File: {filename}  |  Run ID: {run_id}\n"
                     f"Automation Opportunities:\n{opp_text}"))

    # Bottlenecks
    bn = analysis.get("bottlenecks", {}).get("bottlenecks", {})
    if bn:
        docs.append((f"{prefix}_bottlenecks", f"File: {filename}  |  Run ID: {run_id}\n"
                     f"Slowest departments: {json.dumps(bn.get('slowest_departments', {}))}\n"
                     f"Bottleneck details: {json.dumps(bn)}"))

    # AI advisor report
    ai = analysis.get("ai_advisor_report", {})
    if ai and ai.get("mode") != "rule_based_fallback":
        summary = ai.get("executive_summary", "")
        leadership = ai.get("leadership_message", "")
        plan = ai.get("suggested_30_60_90_day_plan", {})
        docs.append((f"{prefix}_ai_report", textwrap.dedent(f"""
            File: {filename}  |  Run ID: {run_id}
            AI Executive Summary: {summary}
            Leadership Message: {leadership}
            30-day plan: {plan.get('day_30', '')}
            60-day plan: {plan.get('day_60', '')}
            90-day plan: {plan.get('day_90', '')}
        """).strip()))

    # Clusters
    clusters = analysis.get("ticket_clusters", {}).get("clusters", [])
    if clusters:
        cluster_text = "\n".join(
            f"- Cluster {c.get('cluster_id')}: {c.get('ticket_count')} tickets, "
            f"top terms: {', '.join(c.get('top_terms', [])[:5])}"
            for c in clusters
        )
        docs.append((f"{prefix}_clusters", f"File: {filename}  |  Run ID: {run_id}\n"
                     f"Ticket Clusters:\n{cluster_text}"))

    return docs


# ── Public API ────────────────────────────────────────────────────────────────
def embed_run_data(run_id: int, filename: str, analysis: dict):
    """
    Called after a successful upload. Embeds all analysis sections.
    Silently no-ops if OpenAI key is missing (RAG just won't work).
    """
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

        col = _runs_collection()
        # Upsert so re-uploads don't duplicate
        col.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)
    except Exception as e:
        print(f"[RAG] embed_run_data failed: {e}")


def embed_csv_sample(run_id: int, filename: str, df_sample: str):
    """
    Embed a text summary of the raw CSV (first N rows as CSV string).
    """
    if not os.getenv("OPENAI_API_KEY"):
        return

    try:
        text = f"File: {filename}  |  Run ID: {run_id}\nCSV Sample:\n{df_sample}"
        embeddings = _embed([text])
        _csv_collection().upsert(
            ids=[f"csv_{run_id}"],
            embeddings=embeddings,
            documents=[text],
            metadatas=[{"run_id": run_id, "filename": filename}],
        )
    except Exception as e:
        print(f"[RAG] embed_csv_sample failed: {e}")


def seed_knowledge_base():
    """
    Seed the static ITSM/ops knowledge base.
    Safe to call multiple times — upsert is idempotent.
    """
    if not os.getenv("OPENAI_API_KEY"):
        return

    knowledge_docs = [
        ("kb_sla_basics", textwrap.dedent("""
            ITSM SLA Best Practices:
            - P1 (Critical): resolve within 1 hour, respond within 15 minutes
            - P2 (High): resolve within 4 hours, respond within 30 minutes
            - P3 (Medium): resolve within 24 hours, respond within 2 hours
            - P4 (Low): resolve within 72 hours, respond within 8 hours
            SLA breach rate above 10% indicates a systemic bottleneck.
            Average resolution time above 48 hours across all priorities is a major risk.
        """)),
        ("kb_automation_roi", textwrap.dedent("""
            Automation ROI in ITSM:
            - Password reset tickets: automatable in ~2 weeks, saves 5-10 min per ticket
            - Account unlock: automatable via self-service portal, 80%+ deflection typical
            - Software provisioning: automation reduces avg 4hr tickets to under 10 minutes
            - Incident triage: AI classification cuts routing time by 60-70%
            - Typical ROI breakeven: 3-6 months for high-volume automations
            Rule of thumb: if a ticket type has >50 occurrences/month and <30 min resolution, it's automatable.
        """)),
        ("kb_data_quality_itsm", textwrap.dedent("""
            Data Quality Standards for ITSM Ticket Exports:
            - Required fields: ticket_id, created_date, resolved_date, status, priority, department, category
            - Missing priority: tickets cannot be triaged correctly, inflates P3/P4 backlog
            - Missing resolution time: cannot calculate SLA compliance or team performance
            - Duplicate tickets: inflate volume KPIs by 5-15% on average
            - Acceptable missing rate: below 5% per critical field
            - Quality score above 80 is production-grade; below 60 requires remediation before automation
        """)),
        ("kb_bottleneck_diagnosis", textwrap.dedent("""
            Diagnosing Operational Bottlenecks:
            - If one department has >2x the avg resolution time → staffing or skill gap
            - If P1 tickets resolve slower than P3 → escalation path is broken
            - If volume spikes on Monday/Friday → workload leveling opportunity
            - If same category has high volume AND high resolution time → automation target
            - Bottleneck resolution playbook: (1) identify, (2) isolate root cause,
              (3) pilot fix with small team, (4) measure SLA impact, (5) scale
        """)),
        ("kb_executive_reporting", textwrap.dedent("""
            Executive Reporting for Operations Intelligence:
            - CFOs care about: cost per ticket, automation savings, headcount efficiency
            - COOs care about: SLA compliance %, bottleneck departments, ticket backlog trends
            - CIOs care about: data quality, system integration gaps, automation roadmap
            - Key metrics to report: quality score, automation opportunity value ($), SLA breach rate,
              top 3 bottleneck departments, recommended 30/60/90 day actions
            - Frame savings as annualised: monthly_savings × 12 for board presentations
        """)),
        ("kb_clustering_insights", textwrap.dedent("""
            Interpreting Ticket Clustering Results:
            - A cluster with >20% of total volume is a systemic pattern, not noise
            - Clusters with high resolution time AND high ticket count = top automation priority
            - Semantically similar clusters (shared top terms) may indicate misrouting
            - Singleton clusters (1-2 tickets) are outliers — don't build automation for them
            - After clustering, map each cluster to a process owner for accountability
        """)),
    ]

    try:
        ids = [d[0] for d in knowledge_docs]
        texts = [d[1].strip() for d in knowledge_docs]
        embeddings = _embed(texts)
        metadatas = [{"source": "knowledge_base"} for _ in knowledge_docs]
        _knowledge_collection().upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)
        print(f"[RAG] Seeded {len(knowledge_docs)} knowledge base documents")
    except Exception as e:
        print(f"[RAG] seed_knowledge_base failed: {e}")


def chat(query: str, run_id: Optional[int] = None, n_results: int = 4) -> dict:
    """
    Retrieve relevant chunks and generate a grounded answer.

    Args:
        query: The user's natural language question
        run_id: If provided, prioritise chunks from this specific run
        n_results: How many chunks to retrieve per collection

    Returns:
        {"answer": str, "sources": list[str]}
    """
    if not os.getenv("OPENAI_API_KEY"):
        return {
            "answer": "RAG chat requires an OpenAI API key. Set OPENAI_API_KEY in your .env file.",
            "sources": [],
        }

    try:
        import openai
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Embed the query
        query_embedding = _embed([query])[0]

        # Retrieve from all three collections
        context_chunks = []
        sources = []

        # Priority: run-specific data first
        if run_id is not None:
            where = {"run_id": run_id}
            for col in [_runs_collection(), _csv_collection()]:
                try:
                    results = col.query(
                        query_embeddings=[query_embedding],
                        n_results=min(n_results, col.count() or 1),
                        where=where,
                    )
                    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
                        context_chunks.append(doc)
                        sources.append(f"Run #{meta.get('run_id')} – {meta.get('filename', '')}")
                except Exception:
                    pass

        # Always include knowledge base
        kb_col = _knowledge_collection()
        if kb_col.count() > 0:
            try:
                kb_results = kb_col.query(
                    query_embeddings=[query_embedding],
                    n_results=min(2, kb_col.count()),
                )
                for doc in kb_results["documents"][0]:
                    context_chunks.append(doc)
                    sources.append("Veracity Knowledge Base")
            except Exception:
                pass

        # If no run-specific results, search all runs
        if not context_chunks or run_id is None:
            runs_col = _runs_collection()
            if runs_col.count() > 0:
                try:
                    all_results = runs_col.query(
                        query_embeddings=[query_embedding],
                        n_results=min(n_results, runs_col.count()),
                    )
                    for doc, meta in zip(all_results["documents"][0], all_results["metadatas"][0]):
                        if doc not in context_chunks:
                            context_chunks.append(doc)
                            sources.append(f"Run #{meta.get('run_id')} – {meta.get('filename', '')}")
                except Exception:
                    pass

        if not context_chunks:
            return {
                "answer": "No data has been indexed yet. Upload a CSV first to enable RAG chat.",
                "sources": [],
            }

        context_text = "\n\n---\n\n".join(context_chunks)

        system_prompt = """You are Veracity AI, an expert operations intelligence assistant.
Answer questions about ticket data, process bottlenecks, automation opportunities, and data quality
based ONLY on the provided context. Be specific, concise, and business-focused.
If the context doesn't contain enough information to answer, say so clearly.
Do not invent numbers or facts not present in the context."""

        user_prompt = f"""Context from Veracity analyses:

{context_text}

Question: {query}

Answer:"""

        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=600,
            temperature=0.2,
        )

        answer = response.choices[0].message.content.strip()
        unique_sources = list(dict.fromkeys(sources))  # deduplicate preserving order

        return {"answer": answer, "sources": unique_sources}

    except Exception as e:
        return {"answer": f"Chat error: {str(e)}", "sources": []}
