import pandas as pd

from app.column_detector import detect_ticket_columns


def analyze_tickets(df: pd.DataFrame) -> dict:
    column_detection = detect_ticket_columns(list(df.columns))
    detected = column_detection["detected_columns"]

    department_col = detected.get("department_column")
    issue_col = detected.get("issue_column")
    resolution_col = detected.get("resolution_time_column")
    priority_col = detected.get("priority_column")
    status_col = detected.get("status_column")

    result = {
        "is_ticket_dataset": False,
        "detected_columns": detected,
        "column_detection_confidence": column_detection["confidence"],
        "department_counts": {},
        "top_issues": {},
        "priority_counts": {},
        "status_counts": {},
        "resolution_time": {},
        "message": "",
    }

    if not issue_col and not department_col:
        result["message"] = (
            "This CSV was uploaded successfully, but Veracity could not confidently "
            "detect ticket/workflow columns like issue, department, or resolution time."
        )
        return result

    result["is_ticket_dataset"] = True
    result["message"] = "Ticket/workflow dataset detected successfully."

    if department_col:
        result["department_counts"] = (
            df[department_col]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .to_dict()
        )

    if issue_col:
        result["top_issues"] = (
            df[issue_col]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .head(15)
            .to_dict()
        )

    if priority_col:
        result["priority_counts"] = (
            df[priority_col]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .to_dict()
        )

    if status_col:
        result["status_counts"] = (
            df[status_col]
            .fillna("Unknown")
            .astype(str)
            .value_counts()
            .to_dict()
        )

    if resolution_col:
        resolution_values = pd.to_numeric(df[resolution_col], errors="coerce")

        result["resolution_time"] = {
            "average": round(float(resolution_values.mean()), 2)
            if not pd.isna(resolution_values.mean())
            else None,
            "median": round(float(resolution_values.median()), 2)
            if not pd.isna(resolution_values.median())
            else None,
            "max": round(float(resolution_values.max()), 2)
            if not pd.isna(resolution_values.max())
            else None,
            "min": round(float(resolution_values.min()), 2)
            if not pd.isna(resolution_values.min())
            else None,
        }

        if department_col:
            temp_df = df.copy()
            temp_df[resolution_col] = resolution_values

            slowest_departments = (
                temp_df.groupby(department_col)[resolution_col]
                .mean()
                .dropna()
                .sort_values(ascending=False)
                .head(5)
                .round(2)
                .to_dict()
            )

            result["slowest_departments"] = slowest_departments

    return result