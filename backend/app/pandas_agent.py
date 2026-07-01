"""
Pandas Agent — generates and executes pandas code to answer
precise data questions about uploaded CSV files.

Instead of retrieving pre-computed summaries, this agent:
1. Loads the actual DataFrame for the run
2. Inspects the schema (columns, dtypes, sample rows)
3. Asks GPT to write pandas code to answer the question
4. Executes the code in a sandboxed namespace
5. Returns the result as a readable string
"""
import traceback
import pandas as pd
import numpy as np
from typing import Optional


def _get_chat():
    from app.rag_engine import _chat
    return _chat


def _safe_exec(code: str, df: pd.DataFrame) -> tuple[bool, str]:
    """
    Execute pandas code in a restricted namespace.
    Returns (success, result_string).
    """
    namespace = {
        "df": df.copy(),
        "pd": pd,
        "np": np,
        "result": None,
    }
    # Block dangerous builtins
    safe_builtins = {
        "print": print, "len": len, "str": str, "int": int,
        "float": float, "list": list, "dict": dict, "sum": sum,
        "max": max, "min": min, "round": round, "sorted": sorted,
        "enumerate": enumerate, "zip": zip, "range": range,
        "abs": abs, "bool": bool,
    }
    namespace["__builtins__"] = safe_builtins

    try:
        exec(code, namespace)
        result = namespace.get("result")
        if result is None:
            return False, "Code ran but did not set a `result` variable."
        if isinstance(result, pd.DataFrame):
            if len(result) > 20:
                result = result.head(20)
            return True, result.to_string(index=False)
        if isinstance(result, pd.Series):
            return True, result.to_string()
        return True, str(result)
    except Exception:
        return False, traceback.format_exc()


def run_pandas_agent(
    query: str,
    run_id: Optional[int],
    max_attempts: int = 3,
) -> dict:
    """
    Main entry point for the Pandas Agent.
    Returns {"answer": str, "sources": list, "code": str}
    """
    from app.data_store import load_dataframe, list_runs

    # Load DataFrame
    df = None
    actual_run_id = run_id

    if run_id is not None:
        df = load_dataframe(run_id)

    if df is None:
        # Try latest available run
        runs = list_runs()
        if runs:
            actual_run_id = runs[-1]
            df = load_dataframe(actual_run_id)

    if df is None:
        return {
            "answer": "No CSV data found. Please upload a CSV file first.",
            "sources": [],
            "code": "",
        }

    _chat = _get_chat()

    # Build schema description
    schema_lines = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        n_unique = df[col].nunique()
        sample = df[col].dropna().head(3).tolist()
        schema_lines.append(f"  - {col} ({dtype}, {n_unique} unique values, sample: {sample})")

    schema_desc = "\n".join(schema_lines)
    sample_rows = df.head(5).to_csv(index=False)

    system_prompt = f"""You are a pandas expert. You will write Python code to answer questions about a DataFrame.

DataFrame schema ({len(df)} rows, {len(df.columns)} columns):
{schema_desc}

Sample rows:
{sample_rows}

Rules:
- The DataFrame is already loaded as `df`
- Store your final answer in a variable called `result`
- `result` can be a string, number, DataFrame, or Series
- Keep code concise — no imports needed (pd and np are available)
- Handle missing values gracefully with .dropna() or fillna()
- For time-based questions, try pd.to_datetime() on date columns
- ONLY return the Python code block, nothing else
"""

    code = ""
    last_error = ""

    for attempt in range(max_attempts):
        user_msg = f"Question: {query}"
        if attempt > 0:
            user_msg += f"\n\nPrevious code failed:\n{code}\nError: {last_error}\n\nFix the code."

        try:
            raw = _chat(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.1,
            )
            # Strip markdown code fences
            code = raw.strip()
            if code.startswith("```"):
                lines = code.split("\n")
                code = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

            success, output = _safe_exec(code, df)

            if success:
                answer = f"{output}"
                return {
                    "answer": answer,
                    "sources": [f"Run #{actual_run_id} – live computation"],
                    "code": code,
                }
            else:
                last_error = output
                print(f"[PandasAgent] Attempt {attempt+1} failed: {output[:200]}")

        except Exception as e:
            last_error = str(e)
            print(f"[PandasAgent] Attempt {attempt+1} exception: {e}")

    return {
        "answer": f"I couldn't compute an answer after {max_attempts} attempts. Last error: {last_error[:300]}",
        "sources": [],
        "code": code,
    }
