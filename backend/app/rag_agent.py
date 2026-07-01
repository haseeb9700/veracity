"""
Veracity RAG Agent — LangGraph Edition.

Graph flow:
  START
    → rewrite_query      (rewrite query for better retrieval)
    → retrieve           (hybrid vector + BM25 + RRF search)
    → grade_documents    (filter irrelevant chunks)
    → [decision] enough_docs?
        YES → generate   (generate grounded answer)
              → grade_answer
              → [decision] answer_useful?
                  YES → END
                  NO  → transform_query → retrieve (retry loop)
        NO  → transform_query → retrieve (retry loop, up to max_retries)

After max_retries, returns best available answer.
"""

import json
import os
from typing import Optional, TypedDict, List

from langgraph.graph import StateGraph, END, START


# ── State ─────────────────────────────────────────────────────────────────────
class RAGState(TypedDict):
    query: str
    rewritten_query: str
    run_id: Optional[int]
    n_results: int
    chunks: List[dict]
    relevant_chunks: List[dict]
    answer: str
    sources: List[str]
    answer_grade: str          # "useful" | "not_useful"
    retry_count: int
    max_retries: int


# ── Import helpers from rag_engine (keep DRY) ─────────────────────────────────
def _get_helpers():
    from app.rag_engine import (
        _chat, _embed, _rewrite_query,
        _bm25_search, _rrf, _rerank,
        _query_collection, _runs_col, _csv_col, _kb_col,
    )
    return _chat, _embed, _rewrite_query, _bm25_search, _rrf, _rerank, _query_collection, _runs_col, _csv_col, _kb_col


# ── Node: rewrite_query ───────────────────────────────────────────────────────
def rewrite_query_node(state: RAGState) -> dict:
    _chat, _embed, _rewrite_query, *_ = _get_helpers()
    query = state["query"]
    rewritten = _rewrite_query(query)
    print(f"[Agent] Rewrite: '{query}' → '{rewritten}'")
    return {"rewritten_query": rewritten}


# ── Node: retrieve ────────────────────────────────────────────────────────────
def retrieve_node(state: RAGState) -> dict:
    _chat, _embed, _rewrite_query, _bm25_search, _rrf, _rerank, _query_collection, _runs_col, _csv_col, _kb_col = _get_helpers()

    rewritten = state["rewritten_query"]
    run_id = state["run_id"]
    n_results = state["n_results"]

    q_embedding = _embed([rewritten])[0]
    all_chunks: dict = {}

    def _add(col, where=None, n=n_results):
        results = _query_collection(col, q_embedding, n, where)
        for c in results:
            all_chunks[c["id"]] = c

    if run_id is not None:
        _add(_runs_col(), where={"run_id": run_id})
        _add(_csv_col(), where={"run_id": run_id})

    _add(_runs_col(), n=n_results)
    _add(_kb_col(), n=3)

    chunk_list = list(all_chunks.values())

    if chunk_list:
        docs_text = [c["text"] for c in chunk_list]
        vector_ids = [c["id"] for c in chunk_list]
        bm25_ranked = _bm25_search(rewritten, docs_text, top_k=len(docs_text))
        bm25_ids = [chunk_list[idx]["id"] for idx, _ in bm25_ranked]
        merged_ids = _rrf(vector_ids, bm25_ids)
        chunk_list = [all_chunks[cid] for cid in merged_ids if cid in all_chunks]

    print(f"[Agent] Retrieved {len(chunk_list)} chunks")
    return {"chunks": chunk_list}


# ── Node: grade_documents ─────────────────────────────────────────────────────
def grade_documents_node(state: RAGState) -> dict:
    _chat, *_ = _get_helpers()
    query = state["rewritten_query"]
    chunks = state["chunks"]

    if not chunks:
        return {"relevant_chunks": []}

    # Re-rank and keep top 4
    from app.rag_engine import _rerank
    reranked = _rerank(query, chunks[:8])

    # Grade each chunk — keep those scoring >= 4
    relevant = []
    try:
        numbered = "\n\n".join(f"[{i+1}] {c['text'][:300]}" for i, c in enumerate(reranked[:6]))
        prompt = (
            f"Query: {query}\n\n"
            f"For each passage, rate relevance 0-10. "
            f"Return ONLY a JSON array of integers, e.g. [8,2,5].\n\n"
            f"Passages:\n{numbered}"
        )
        raw = _chat([{"role": "user", "content": prompt}], temperature=0)
        scores = json.loads(raw)
        if isinstance(scores, list):
            for i, chunk in enumerate(reranked[:len(scores)]):
                if i < len(scores) and scores[i] >= 4:
                    relevant.append(chunk)
    except Exception:
        relevant = reranked[:4]

    if not relevant:
        relevant = reranked[:2]  # always keep at least 2

    print(f"[Agent] Graded docs: {len(relevant)} relevant out of {len(chunks)}")
    return {"relevant_chunks": relevant}


# ── Node: generate ────────────────────────────────────────────────────────────
def generate_node(state: RAGState) -> dict:
    _chat, *_ = _get_helpers()
    query = state["query"]
    chunks = state["relevant_chunks"]

    if not chunks:
        return {
            "answer": "I couldn't find relevant data to answer your question. Try uploading a CSV or connecting Jira/Zendesk.",
            "sources": [],
        }

    context = "\n\n---\n\n".join(c["text"] for c in chunks)

    answer = _chat([
        {"role": "system", "content": (
            "You are Veracity AI, an expert operations intelligence assistant. "
            "Answer questions about ticket data, bottlenecks, automation opportunities, "
            "and data quality based ONLY on the provided context. "
            "Be specific, concise, and business-focused. "
            "If the context doesn't contain enough information, say so clearly. "
            "Never invent numbers or facts not in the context."
        )},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"},
    ], temperature=0.2)

    sources = []
    for c in chunks:
        meta = c.get("meta", {})
        if meta.get("source") == "knowledge_base":
            sources.append("Veracity Knowledge Base")
        else:
            sources.append(f"Run #{meta.get('run_id')} – {meta.get('filename', '')}")
    unique_sources = list(dict.fromkeys(sources))

    print(f"[Agent] Generated answer ({len(answer)} chars)")
    return {"answer": answer, "sources": unique_sources}


# ── Node: grade_answer ────────────────────────────────────────────────────────
def grade_answer_node(state: RAGState) -> dict:
    _chat, *_ = _get_helpers()
    query = state["query"]
    answer = state["answer"]

    try:
        prompt = (
            f"Query: {query}\n\n"
            f"Answer: {answer}\n\n"
            f"Does this answer directly address the query? "
            f"Reply with ONLY 'useful' or 'not_useful'."
        )
        grade = _chat([{"role": "user", "content": prompt}], temperature=0).strip().lower()
        grade = "useful" if "useful" in grade and "not" not in grade else "not_useful"
    except Exception:
        grade = "useful"  # default to useful on error

    print(f"[Agent] Answer grade: {grade}")
    return {"answer_grade": grade}


# ── Node: transform_query ─────────────────────────────────────────────────────
def transform_query_node(state: RAGState) -> dict:
    _chat, *_ = _get_helpers()
    query = state["query"]
    retry_count = state["retry_count"] + 1

    try:
        rewritten = _chat([
            {"role": "system", "content": (
                "You are a search query optimizer. The previous query didn't return useful results. "
                "Rewrite it using different keywords, synonyms, or a broader/narrower scope. "
                "Return ONLY the rewritten query."
            )},
            {"role": "user", "content": f"Original query: {query}"},
        ], temperature=0.5)
    except Exception:
        rewritten = query

    print(f"[Agent] Transform query (retry {retry_count}): '{rewritten}'")
    return {"rewritten_query": rewritten, "retry_count": retry_count}


# ── Conditional edges ─────────────────────────────────────────────────────────
def should_retry_after_grading(state: RAGState) -> str:
    relevant = state.get("relevant_chunks", [])
    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)

    if len(relevant) >= 2:
        return "generate"
    if retry_count < max_retries:
        return "transform_query"
    return "generate"  # give up and generate with what we have


def should_retry_after_answer(state: RAGState) -> str:
    grade = state.get("answer_grade", "useful")
    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)

    if grade == "useful" or retry_count >= max_retries:
        return END
    return "transform_query"


# ── Build graph ───────────────────────────────────────────────────────────────
def build_rag_graph():
    graph = StateGraph(RAGState)

    graph.add_node("rewrite_query", rewrite_query_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("grade_documents", grade_documents_node)
    graph.add_node("generate", generate_node)
    graph.add_node("grade_answer", grade_answer_node)
    graph.add_node("transform_query", transform_query_node)

    graph.add_edge(START, "rewrite_query")
    graph.add_edge("rewrite_query", "retrieve")
    graph.add_edge("retrieve", "grade_documents")
    graph.add_conditional_edges(
        "grade_documents",
        should_retry_after_grading,
        {"generate": "generate", "transform_query": "transform_query"},
    )
    graph.add_edge("generate", "grade_answer")
    graph.add_conditional_edges(
        "grade_answer",
        should_retry_after_answer,
        {"transform_query": "transform_query", END: END},
    )
    graph.add_edge("transform_query", "retrieve")

    return graph.compile()


# ── Public entry point ────────────────────────────────────────────────────────
_compiled_graph = None


def run_rag_agent(query: str, run_id: Optional[int] = None, n_results: int = 6) -> dict:
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_rag_graph()

    initial_state: RAGState = {
        "query": query,
        "rewritten_query": query,
        "run_id": run_id,
        "n_results": n_results,
        "chunks": [],
        "relevant_chunks": [],
        "answer": "",
        "sources": [],
        "answer_grade": "",
        "retry_count": 0,
        "max_retries": 2,
    }

    result = _compiled_graph.invoke(initial_state)

    return {
        "answer": result.get("answer", "No answer generated."),
        "sources": result.get("sources", []),
        "rewritten_query": result.get("rewritten_query", query),
        "retries": result.get("retry_count", 0),
        "answer_grade": result.get("answer_grade", ""),
    }
