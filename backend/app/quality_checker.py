import pandas as pd


def calculate_quality_score(df: pd.DataFrame) -> dict:
    issues = []
    score = 100

    total_cells = df.shape[0] * df.shape[1]

    # 1. Missing values
    missing_count = int(df.isnull().sum().sum())
    missing_percentage = (missing_count / total_cells) * 100 if total_cells > 0 else 0

    if missing_percentage > 0:
        penalty = min(25, missing_percentage)
        score -= penalty
        issues.append(
            f"Dataset has {missing_count} missing values ({missing_percentage:.2f}% of all cells)."
        )
    else:
        issues.append("Dataset has no missing values.")

    # 2. Duplicate rows
    duplicate_count = int(df.duplicated().sum())
    duplicate_percentage = (duplicate_count / len(df)) * 100 if len(df) > 0 else 0

    if duplicate_count > 0:
        penalty = min(25, duplicate_percentage)
        score -= penalty
        issues.append(
            f"Dataset has {duplicate_count} duplicate rows ({duplicate_percentage:.2f}% of rows)."
        )
    else:
        issues.append("Dataset has 0 duplicate rows.")

    # 3. Possible numeric columns stored as text
    numeric_like_issues = []

    for column in df.columns:
        if df[column].dtype == "object":
            converted = pd.to_numeric(df[column], errors="coerce")
            non_null_original = df[column].notnull().sum()
            numeric_count = converted.notnull().sum()

            if non_null_original > 0:
                numeric_ratio = numeric_count / non_null_original

                if 0.5 <= numeric_ratio < 1.0:
                    numeric_like_issues.append(column)

    if numeric_like_issues:
        score -= min(25, len(numeric_like_issues) * 5)
        issues.append(
            "Columns that look numeric but contain non-numeric values: "
            + ", ".join(numeric_like_issues)
        )
    else:
        issues.append("No obvious numeric columns stored as messy text were detected.")

    # 4. Empty columns
    empty_columns = [col for col in df.columns if df[col].isnull().all()]

    if empty_columns:
        score -= min(25, len(empty_columns) * 10)
        issues.append("Completely empty columns found: " + ", ".join(empty_columns))
    else:
        issues.append("No completely empty columns found.")

    score = max(0, round(score, 2))

    if score >= 90:
        grade = "A"
    elif score >= 80:
        grade = "B"
    elif score >= 70:
        grade = "C"
    elif score >= 60:
        grade = "D"
    else:
        grade = "F"

    return {
        "quality_score": score,
        "grade": grade,
        "issues": issues,
        "missing_percentage": round(missing_percentage, 2),
        "duplicate_percentage": round(duplicate_percentage, 2),
    }