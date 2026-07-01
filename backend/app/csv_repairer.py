"""
csv_repairer.py — Flexible CSV ingestion pipeline for Veracity.

Pipeline (each layer only activates if the previous produces a suspicious result):
  1. Encoding detection   — chardet
  2. Dialect detection    — csv.Sniffer → clevercsv fallback
  3. Structural repair    — skip junk rows, detect true header row
  4. LLM fallback         — GPT parses the raw top-30 lines and returns parse params

Returns a clean pandas DataFrame + a repair_log dict describing what was done.
"""

import csv
import io
import json
import os
import re
from typing import Optional

import chardet
import pandas as pd


# ── Helpers ───────────────────────────────────────────────────────────────────

def _detect_encoding(raw: bytes) -> str:
    result = chardet.detect(raw)
    enc = result.get("encoding") or "utf-8"
    # Normalise common aliases
    enc = enc.lower().replace("-", "_")
    aliases = {"utf_8_sig": "utf-8-sig", "ascii": "utf-8"}
    return aliases.get(enc, enc)


def _detect_delimiter(text: str) -> Optional[str]:
    """Try csv.Sniffer first; fall back to clevercsv."""
    try:
        sample = "\n".join(text.splitlines()[:20])
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
        return dialect.delimiter
    except csv.Error:
        pass

    try:
        import clevercsv
        dialect = clevercsv.Sniffer().sniff(text[:4096], verbose=False)
        if dialect:
            return dialect.delimiter
    except Exception:
        pass

    # Count occurrences across first 10 lines and pick the most common candidate
    candidates = [",", "\t", ";", "|"]
    lines = text.splitlines()[:10]
    counts = {d: sum(line.count(d) for line in lines) for d in candidates}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _looks_like_header_row(row: list) -> bool:
    """Heuristic: a header row has mostly string-ish, non-numeric cells."""
    if not row:
        return False
    string_cells = sum(
        1 for c in row
        if c and not re.match(r"^-?\d+(\.\d+)?$", str(c).strip())
    )
    return string_cells / len(row) >= 0.6


def _is_junk_row(row: list, n_cols: int) -> bool:
    """True if the row is probably metadata/blank/title rather than real data."""
    non_empty = [c for c in row if str(c).strip()]
    if not non_empty:
        return True  # blank row
    if len(non_empty) <= 1 and n_cols > 2:
        return True  # single-cell title row
    return False


def _find_header_row(rows: list[list]) -> int:
    """
    Scan rows top-down and return the index of the first row that looks like a header.
    Cap search at row 15 to avoid false positives deep in the data.
    """
    for i, row in enumerate(rows[:15]):
        if _looks_like_header_row(row):
            return i
    return 0  # default to row 0


def _llm_fallback(raw_text: str) -> dict:
    """
    Send the first 30 lines to GPT and ask for parse parameters.
    Returns a dict with keys: delimiter, skiprows, encoding (best guesses).
    """
    try:
        from app.rag_engine import _chat
        snippet = "\n".join(raw_text.splitlines()[:30])
        prompt = (
            "You are a CSV file analyser. Here are the first 30 lines of a raw file:\n\n"
            f"```\n{snippet}\n```\n\n"
            "Determine the best way to parse this as a pandas DataFrame. "
            "Reply with ONLY a JSON object with these keys:\n"
            '  "delimiter": single character (e.g. "," or "\\t" or ";" or "|"),\n'
            '  "skiprows": number of rows to skip before the header (integer, 0 if none),\n'
            '  "header_row": 0-based index of the header row AFTER skipping (usually 0),\n'
            '  "reason": one sentence explaining what was wrong.\n'
            "No other text."
        )
        raw = _chat([{"role": "user", "content": prompt}], temperature=0, max_tokens=120)
        # Strip markdown fences if present
        raw = re.sub(r"```(?:json)?|```", "", raw).strip()
        params = json.loads(raw)
        return {
            "delimiter": params.get("delimiter", ","),
            "skiprows": int(params.get("skiprows", 0)),
            "header_row": int(params.get("header_row", 0)),
            "reason": params.get("reason", "LLM-guided parse"),
        }
    except Exception as e:
        return {"delimiter": ",", "skiprows": 0, "header_row": 0, "reason": f"LLM fallback failed: {e}"}


def _is_suspicious(df: pd.DataFrame) -> bool:
    """Return True if the parsed DataFrame looks wrong (too few cols, >50% nulls in header row)."""
    if df.shape[1] <= 1:
        return True
    col_names = [str(c) for c in df.columns]
    unnamed = sum(1 for c in col_names if c.startswith("Unnamed:") or c.strip() == "")
    if unnamed / len(col_names) > 0.4:
        return True
    null_ratio = df.isnull().mean().mean()
    if null_ratio > 0.6:
        return True
    return False


# ── Structural repair ─────────────────────────────────────────────────────────

def _structural_repair(text: str, delimiter: str) -> tuple[pd.DataFrame, dict]:
    """
    Parse the text with the given delimiter, skip junk rows at the top,
    and locate the true header row.
    Returns (DataFrame, repair_info).
    """
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)

    if not rows:
        return pd.DataFrame(), {"header_row": 0, "junk_rows_skipped": 0}

    n_cols = max(len(r) for r in rows[:20]) if rows else 1

    # Strip leading junk rows
    start = 0
    for i, row in enumerate(rows[:10]):
        if not _is_junk_row(row, n_cols):
            start = i
            break

    trimmed = rows[start:]
    header_idx = _find_header_row(trimmed)
    header = trimmed[header_idx]
    data_rows = trimmed[header_idx + 1:]

    # Pad/trim rows to header length
    n = len(header)
    data_rows = [r[:n] + [""] * max(0, n - len(r)) for r in data_rows]

    df = pd.DataFrame(data_rows, columns=header)

    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    # Drop fully empty columns/rows
    df = df.replace("", pd.NA).dropna(how="all").dropna(axis=1, how="all")

    return df, {
        "header_row": start + header_idx,
        "junk_rows_skipped": start,
    }


# ── Public entry point ────────────────────────────────────────────────────────

def repair_and_load(file_bytes: bytes, filename: str = "file.csv") -> tuple[pd.DataFrame, dict]:
    """
    Attempt to load a potentially malformed CSV file robustly.

    Returns:
        df          — clean pandas DataFrame
        repair_log  — dict describing what was detected and fixed
    """
    repair_log: dict = {
        "filename": filename,
        "encoding": "utf-8",
        "delimiter": ",",
        "junk_rows_skipped": 0,
        "header_row": 0,
        "llm_used": False,
        "repairs": [],
    }

    # ── Layer 1: Encoding ──────────────────────────────────────────────────
    encoding = _detect_encoding(file_bytes)
    repair_log["encoding"] = encoding
    if encoding != "utf-8":
        repair_log["repairs"].append(f"Detected encoding: {encoding}")

    try:
        text = file_bytes.decode(encoding, errors="replace")
    except LookupError:
        text = file_bytes.decode("utf-8", errors="replace")
        repair_log["encoding"] = "utf-8 (fallback)"

    # ── Layer 2: Dialect detection ─────────────────────────────────────────
    delimiter = _detect_delimiter(text)
    repair_log["delimiter"] = delimiter
    if delimiter != ",":
        repair_log["repairs"].append(f"Detected non-standard delimiter: '{delimiter}'")

    # ── Layer 3: Fast pandas parse attempt ────────────────────────────────
    try:
        df = pd.read_csv(io.StringIO(text), sep=delimiter, engine="python", on_bad_lines="skip")
        if not _is_suspicious(df):
            repair_log["method"] = "standard"
            return df, repair_log
    except Exception:
        pass

    # ── Layer 3b: Structural repair ───────────────────────────────────────
    try:
        df, struct_info = _structural_repair(text, delimiter)
        repair_log["header_row"] = struct_info["header_row"]
        repair_log["junk_rows_skipped"] = struct_info["junk_rows_skipped"]
        if struct_info["junk_rows_skipped"] > 0:
            repair_log["repairs"].append(f"Skipped {struct_info['junk_rows_skipped']} junk row(s) at top")
        if struct_info["header_row"] > 0:
            repair_log["repairs"].append(f"Header found at row {struct_info['header_row']}")
        if not _is_suspicious(df):
            repair_log["method"] = "structural_repair"
            return df, repair_log
    except Exception:
        pass

    # ── Layer 4: LLM fallback ─────────────────────────────────────────────
    llm_params = _llm_fallback(text)
    repair_log["llm_used"] = True
    repair_log["repairs"].append(f"LLM fallback: {llm_params['reason']}")

    try:
        df = pd.read_csv(
            io.StringIO(text),
            sep=llm_params["delimiter"],
            skiprows=llm_params["skiprows"],
            header=llm_params["header_row"],
            engine="python",
            on_bad_lines="skip",
        )
        repair_log["method"] = "llm_fallback"
        repair_log["delimiter"] = llm_params["delimiter"]
        return df, repair_log
    except Exception as e:
        repair_log["repairs"].append(f"LLM parse also failed: {e}")

    # ── Last resort: return raw read ───────────────────────────────────────
    df = pd.read_csv(io.StringIO(text), sep=",", engine="python", on_bad_lines="skip", header=0)
    repair_log["method"] = "last_resort"
    return df, repair_log
