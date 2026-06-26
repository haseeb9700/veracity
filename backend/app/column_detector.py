from difflib import get_close_matches


COLUMN_ALIASES = {
    "ticket_id": [
        "ticket_id",
        "ticket id",
        "id",
        "case_id",
        "case id",
        "request_id",
        "request id",
        "incident_id",
        "incident id",
    ],
    "department": [
        "department",
        "dept",
        "team",
        "group",
        "assigned_group",
        "assigned group",
        "owner_team",
        "owner team",
        "business_unit",
        "business unit",
        "queue",
    ],
    "issue": [
        "issue",
        "problem",
        "description",
        "ticket_description",
        "ticket description",
        "request_summary",
        "request summary",
        "summary",
        "title",
        "subject",
        "case_reason",
        "case reason",
        "incident_description",
        "incident description",
    ],
    "resolution_time": [
        "resolution_time",
        "resolution time",
        "time_to_resolve",
        "time to resolve",
        "time_to_close",
        "time to close",
        "duration",
        "duration_hours",
        "duration hours",
        "hours_to_resolve",
        "hours to resolve",
        "resolution_hours",
        "resolution hours",
        "age_hours",
        "age hours",
    ],
    "priority": [
        "priority",
        "severity",
        "urgency",
        "importance",
        "impact",
    ],
    "status": [
        "status",
        "state",
        "ticket_status",
        "ticket status",
        "case_status",
        "case status",
        "open_closed",
        "open closed",
    ],
    "created_at": [
        "created_at",
        "created date",
        "created_date",
        "opened_at",
        "opened at",
        "submitted_at",
        "submitted at",
        "date_created",
        "date created",
    ],
    "closed_at": [
        "closed_at",
        "closed at",
        "resolved_at",
        "resolved at",
        "closed_date",
        "closed date",
        "resolved_date",
        "resolved date",
    ],
}


def normalize_column_name(name: str) -> str:
    return (
        str(name)
        .strip()
        .lower()
        .replace("-", "_")
        .replace("/", "_")
        .replace(".", "_")
    )


def detect_ticket_columns(columns: list[str]) -> dict:
    """
    Detects which customer CSV columns map to Veracity's standard ticket fields.
    Works with exact matches, aliases, and close/fuzzy matches.
    """

    original_columns = list(columns)

    normalized_map = {
        normalize_column_name(col): col
        for col in original_columns
    }

    normalized_columns = list(normalized_map.keys())

    detected = {}
    confidence = {}

    for standard_field, aliases in COLUMN_ALIASES.items():
        normalized_aliases = [normalize_column_name(alias) for alias in aliases]

        matched_column = None
        matched_confidence = 0

        # 1. Exact alias match
        for alias in normalized_aliases:
            if alias in normalized_columns:
                matched_column = normalized_map[alias]
                matched_confidence = 1.0
                break

        # 2. Contains match
        if not matched_column:
            for col in normalized_columns:
                for alias in normalized_aliases:
                    if alias in col or col in alias:
                        matched_column = normalized_map[col]
                        matched_confidence = 0.85
                        break
                if matched_column:
                    break

        # 3. Fuzzy match
        if not matched_column:
            close_matches = get_close_matches(
                standard_field,
                normalized_columns,
                n=1,
                cutoff=0.72,
            )

            if close_matches:
                matched_column = normalized_map[close_matches[0]]
                matched_confidence = 0.7

        detected[f"{standard_field}_column"] = matched_column
        confidence[f"{standard_field}_confidence"] = matched_confidence

    return {
        "detected_columns": detected,
        "confidence": confidence,
        "original_columns": original_columns,
    }