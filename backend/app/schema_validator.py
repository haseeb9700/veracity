from app.column_detector import detect_ticket_columns


def validate_ticket_schema(df) -> dict:
    detection = detect_ticket_columns(list(df.columns))
    detected = detection["detected_columns"]

    required_fields = {
        "issue": detected.get("issue_column"),
        "department": detected.get("department_column"),
        "resolution_time": detected.get("resolution_time_column"),
    }

    optional_fields = {
        "ticket_id": detected.get("ticket_id_column"),
        "priority": detected.get("priority_column"),
        "status": detected.get("status_column"),
        "created_at": detected.get("created_at_column"),
        "closed_at": detected.get("closed_at_column"),
    }

    found_required = [
        field for field, column in required_fields.items()
        if column is not None
    ]

    missing_required = [
        field for field, column in required_fields.items()
        if column is None
    ]

    found_optional = [
        field for field, column in optional_fields.items()
        if column is not None
    ]

    required_score = len(found_required) / len(required_fields)
    optional_score = len(found_optional) / len(optional_fields)

    validation_score = round((required_score * 80) + (optional_score * 20), 2)

    is_valid_ticket_schema = len(found_required) >= 2

    return {
        "is_valid_ticket_schema": is_valid_ticket_schema,
        "validation_score": validation_score,
        "detected_columns": detected,
        "column_detection_confidence": detection["confidence"],
        "found_required_fields": found_required,
        "missing_required_fields": missing_required,
        "found_optional_fields": found_optional,
        "message": (
            "Veracity detected a usable ticket/workflow dataset."
            if is_valid_ticket_schema
            else "CSV uploaded, but Veracity could not detect enough ticket/workflow columns."
        ),
    }