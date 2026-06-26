def generate_summary(profile: dict, quality: dict, ticket_analysis: dict, opportunities: dict) -> dict:
    summary_points = []

    summary_points.append(
        f"The dataset contains {profile['rows']} rows and {profile['columns']} columns."
    )

    summary_points.append(
        f"The overall data quality score is {quality['quality_score']} with grade {quality['grade']}."
    )

    if ticket_analysis.get("is_ticket_dataset"):
        summary_points.append(
            "This appears to be an operational ticket or workflow dataset."
        )
    else:
        summary_points.append(
            "This does not strongly appear to be a ticket/workflow dataset yet."
        )

    opp_count = opportunities.get("opportunities_found", 0)

    if opp_count > 0:
        summary_points.append(
            f"Veracity identified {opp_count} recurring process improvement opportunities."
        )

        top_opp = opportunities["opportunities"][0]
        summary_points.append(
            f"The top opportunity is '{top_opp['issue']}' with {top_opp['ticket_count']} related tickets."
        )
    else:
        summary_points.append(
            "No strong automation opportunities were detected from the current dataset."
        )

    return {
        "summary": summary_points
    }