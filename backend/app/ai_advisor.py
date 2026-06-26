import os
import json
from dotenv import load_dotenv

load_dotenv()


def generate_rule_based_ai_report(
    profile: dict,
    quality: dict,
    ticket_analysis: dict,
    opportunities: dict,
    bottlenecks: dict,
    impact_analysis: dict,
    ticket_clusters: dict,
    schema_validation: dict,
) -> dict:
    """
    Fallback report if OpenAI API key is missing or API call fails.
    This keeps Veracity functional even without AI tokens.
    """

    summary = [
        f"Veracity analyzed {profile.get('rows')} rows and {profile.get('columns')} columns.",
        f"The dataset received a quality score of {quality.get('quality_score')} with grade {quality.get('grade')}.",
        f"Estimated cost savings from identified automation opportunities: ${impact_analysis.get('total_estimated_cost_savings', 0)}.",
    ]

    risks = []

    if quality.get("missing_percentage", 0) > 0:
        risks.append("Missing values may reduce reporting accuracy and downstream automation reliability.")

    if quality.get("duplicate_percentage", 0) > 0:
        risks.append("Duplicate rows may inflate ticket volume and distort business impact estimates.")

    slow_departments = (
        bottlenecks.get("bottlenecks", {})
        .get("slowest_departments", {})
    )

    if slow_departments:
        top_slow_department = list(slow_departments.keys())[0]
        risks.append(f"{top_slow_department} appears to be the slowest department by average resolution time.")

    recommendations = [
        "Prioritize automation opportunities with high manual hours and high estimated savings.",
        "Clean missing department, priority, and resolution time values before using this dataset for production decisions.",
        "Create a dashboard to monitor quality score, ticket volume, bottlenecks, and savings over time.",
    ]

    return {
        "mode": "rule_based_fallback",
        "executive_narrative": summary,
        "key_risks": risks,
        "recommended_actions": recommendations,
        "automation_roadmap": [
            "Phase 1: Clean data quality issues and standardize ticket schema.",
            "Phase 2: Automate high-volume recurring tickets.",
            "Phase 3: Monitor bottlenecks and savings trends monthly.",
        ]
    }


def generate_ai_advisor_report(
    profile: dict,
    quality: dict,
    ticket_analysis: dict,
    opportunities: dict,
    bottlenecks: dict,
    impact_analysis: dict,
    ticket_clusters: dict,
    schema_validation: dict,
) -> dict:
    """
    Uses OpenAI to generate an executive business report from computed analytics.
    We send summarized analytics only, not the raw CSV.
    """

    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5.5")

    if not api_key:
        return generate_rule_based_ai_report(
            profile,
            quality,
            ticket_analysis,
            opportunities,
            bottlenecks,
            impact_analysis,
            ticket_clusters,
            schema_validation,
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        analytics_payload = {
            "profile": profile,
            "quality": quality,
            "ticket_analysis": ticket_analysis,
            "opportunities": opportunities,
            "bottlenecks": bottlenecks,
            "impact_analysis": impact_analysis,
            "ticket_clusters": ticket_clusters,
            "schema_validation": schema_validation,
        }

        prompt = f"""
You are an AI transformation advisor for enterprise operations teams.

Analyze the following Veracity analytics output and produce a practical business report.

Return ONLY valid JSON with these keys:
- executive_summary: string
- key_findings: list of strings
- risks: list of strings
- automation_recommendations: list of objects with issue, recommendation, business_value, priority
- data_quality_recommendations: list of strings
- suggested_30_60_90_day_plan: object with keys day_30, day_60, day_90
- leadership_message: string

Rules:
- Do not invent numbers.
- Use only the analytics provided.
- Be specific and business-focused.
- Keep it concise but useful.
- Mention estimated savings when relevant.

Analytics:
{json.dumps(analytics_payload, indent=2)}
"""

        response = client.responses.create(
            model=model,
            input=prompt,
        )

        text_output = response.output_text

        try:
            parsed = json.loads(text_output)
            parsed["mode"] = "openai_generated"
            return parsed
        except json.JSONDecodeError:
            return {
                "mode": "openai_generated_text",
                "raw_report": text_output
            }

    except Exception as e:
        fallback = generate_rule_based_ai_report(
            profile,
            quality,
            ticket_analysis,
            opportunities,
            bottlenecks,
            impact_analysis,
            ticket_clusters,
            schema_validation,
        )
        fallback["openai_error"] = str(e)
        return fallback