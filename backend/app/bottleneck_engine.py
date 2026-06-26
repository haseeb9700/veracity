import pandas as pd


def detect_bottlenecks(df: pd.DataFrame, ticket_analysis: dict) -> dict:
    detected = ticket_analysis.get("detected_columns", {})

    department_col = detected.get("department_column")
    issue_col = detected.get("issue_column")
    resolution_col = detected.get("resolution_time_column")

    if not resolution_col:
        return {
            "bottlenecks_found": False,
            "message": "No resolution time column detected."
        }

    df[resolution_col] = pd.to_numeric(df[resolution_col], errors="coerce")

    bottlenecks = {}

    if department_col:
        bottlenecks["slowest_departments"] = (
            df.groupby(department_col)[resolution_col]
            .mean()
            .sort_values(ascending=False)
            .head(5)
            .round(2)
            .to_dict()
        )

    if issue_col:
        bottlenecks["slowest_issues"] = (
            df.groupby(issue_col)[resolution_col]
            .mean()
            .sort_values(ascending=False)
            .head(5)
            .round(2)
            .to_dict()
        )

    return {
        "bottlenecks_found": True,
        "bottlenecks": bottlenecks
    }