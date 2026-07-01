"""
Simple CSV data store — saves DataFrames to disk keyed by run_id.
Used by the Pandas Agent to run live computations on uploaded data.
"""
import os
import pandas as pd

_DATA_DIR = os.getenv("DATA_DIR", "./csv_store")


def _path(run_id: int) -> str:
    os.makedirs(_DATA_DIR, exist_ok=True)
    return os.path.join(_DATA_DIR, f"run_{run_id}.csv")


def save_dataframe(run_id: int, df: pd.DataFrame):
    try:
        df.to_csv(_path(run_id), index=False)
        print(f"[DataStore] Saved run {run_id} ({len(df)} rows)")
    except Exception as e:
        print(f"[DataStore] Save failed: {e}")


def load_dataframe(run_id: int) -> pd.DataFrame | None:
    path = _path(run_id)
    if not os.path.exists(path):
        return None
    try:
        return pd.read_csv(path)
    except Exception as e:
        print(f"[DataStore] Load failed: {e}")
        return None


def list_runs() -> list[int]:
    if not os.path.exists(_DATA_DIR):
        return []
    runs = []
    for f in os.listdir(_DATA_DIR):
        if f.startswith("run_") and f.endswith(".csv"):
            try:
                runs.append(int(f[4:-4]))
            except ValueError:
                pass
    return sorted(runs)
