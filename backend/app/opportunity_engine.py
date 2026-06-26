import pandas as pd


def classify_impact(total_time_spent: float, ticket_count: int) -> str:
    """
    Classify business impact using total manual effort, not only ticket volume.
    This helps low-volume but high-effort issues show as High Impact.
    """

    if total_time_spent >= 250:
        return "High"
    elif total_time_spent >= 75:
        return "Medium"
    elif ticket_count >= 25:
        return "Medium"
    else:
        return "Low"


def generate_recommendation(issue: str, impact: str) -> str:
    issue_lower = str(issue).lower()

    if "password" in issue_lower or "login" in issue_lower or "account locked" in issue_lower:
        return "Create a self-service identity and access workflow to reduce repetitive IT support effort."

    if "audit" in issue_lower or "compliance" in issue_lower or "policy" in issue_lower:
        return "Automate compliance evidence collection, document reminders, and approval tracking."

    if "onboarding" in issue_lower:
        return "Automate onboarding approval routing, checklist validation, and escalation reminders."

    if "invoice" in issue_lower or "payment" in issue_lower or "purchase order" in issue_lower:
        return "Automate invoice intake, approval routing, and exception handling."

    if "refund" in issue_lower:
        return "Create a guided refund workflow with eligibility checks, approval routing, and status updates."

    if "crm" in issue_lower or "salesforce" in issue_lower:
        return "Build a CRM support workflow that validates permissions, sync issues, and ownership routing."

    if "vpn" in issue_lower or "access" in issue_lower:
        return "Create a self-service access diagnostic flow before routing tickets to IT."

    return f"Investigate automation or self-service workflow for recurring issue: {issue}"


def generate_opportunities(df: pd.DataFrame, ticket_analysis: dict) -> dict:
    opportunities = []

    detected = ticket_analysis.get("detected_columns", {})
    issue_col = detected.get("issue_column")
    department_col = detected.get("department_column")
    resolution_col = detected.get("resolution_time_column")

    if not issue_col:
        return {
            "opportunities_found": 0,
            "opportunities": []
        }

    working_df = df.copy()

    if resolution_col:
        working_df[resolution_col] = pd.to_numeric(
            working_df[resolution_col],
            errors="coerce"
        )

    issue_counts = working_df[issue_col].value_counts()

    for issue, count in issue_counts.items():
        issue_rows = working_df[working_df[issue_col] == issue]

        opportunity = {
            "issue": str(issue),
            "ticket_count": int(count),
        }

        total_time_spent = 0
        avg_time = None

        if resolution_col:
            avg_time = issue_rows[resolution_col].mean()

            if not pd.isna(avg_time):
                total_time_spent = float(avg_time * count)
                opportunity["average_resolution_time"] = round(float(avg_time), 2)
                opportunity["estimated_total_time_spent"] = round(total_time_spent, 2)

        impact = classify_impact(total_time_spent, int(count))

        opportunity["impact_level"] = impact
        opportunity["automation_priority"] = impact
        opportunity["recommendation"] = generate_recommendation(str(issue), impact)

        if department_col:
            top_department = issue_rows[department_col].value_counts()

            if len(top_department) > 0:
                opportunity["main_department"] = str(top_department.idxmax())
            else:
                opportunity["main_department"] = "Unknown"

        opportunities.append(opportunity)

    opportunities = sorted(
        opportunities,
        key=lambda x: (
            x.get("estimated_total_time_spent", 0),
            x.get("ticket_count", 0)
        ),
        reverse=True
    )

    opportunities = opportunities[:10]

    return {
        "opportunities_found": len(opportunities),
        "opportunities": opportunities
    }