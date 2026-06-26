def estimate_business_impact(opportunities: dict, hourly_cost: float = 45.0) -> dict:
    """
    Estimate business impact from recurring ticket/process opportunities.

    hourly_cost:
    Default assumed employee operational cost per hour.
    Later we can make this user-configurable from the frontend.
    """

    impact_items = []
    total_estimated_hours = 0
    total_potential_savings = 0

    for opportunity in opportunities.get("opportunities", []):
        issue = opportunity.get("issue")
        ticket_count = opportunity.get("ticket_count", 0)
        avg_resolution_time = opportunity.get("average_resolution_time")

        if avg_resolution_time is None:
            continue

        estimated_manual_hours = ticket_count * avg_resolution_time

        # Assume automation/self-service can reduce 70% of manual effort
        potential_hours_saved = estimated_manual_hours * 0.70
        estimated_cost_savings = potential_hours_saved * hourly_cost

        impact_item = {
            "issue": issue,
            "ticket_count": ticket_count,
            "average_resolution_time": avg_resolution_time,
            "estimated_manual_hours": round(estimated_manual_hours, 2),
            "potential_hours_saved": round(potential_hours_saved, 2),
            "estimated_cost_savings": round(estimated_cost_savings, 2),
            "assumption": "Assumes automation can reduce 70% of manual effort."
        }

        impact_items.append(impact_item)

        total_estimated_hours += estimated_manual_hours
        total_potential_savings += estimated_cost_savings

    return {
        "hourly_cost_assumption": hourly_cost,
        "total_estimated_manual_hours": round(total_estimated_hours, 2),
        "total_estimated_cost_savings": round(total_potential_savings, 2),
        "impact_items": impact_items
    }