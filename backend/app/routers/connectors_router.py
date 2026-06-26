"""
Connectors: pull ticket data directly from Jira or Zendesk.
Each endpoint fetches tickets, maps them to the standard schema,
runs the full analysis pipeline, and returns the same payload as /upload.
"""
import io
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import requests
from requests.auth import HTTPBasicAuth

from app.auth import get_current_user, get_db
from app.db.models import AnalysisRun, User
from app.profiler import profile_dataframe
from app.quality_checker import calculate_quality_score
from app.ticket_analyzer import analyze_tickets
from app.opportunity_engine import generate_opportunities
from app.summary_engine import generate_summary
from app.bottleneck_engine import detect_bottlenecks
from app.impact_engine import estimate_business_impact
from app.clustering_engine import cluster_ticket_issues
from app.schema_validator import validate_ticket_schema
from app.ai_advisor import generate_ai_advisor_report
from app.rag_engine import embed_run_data, embed_csv_sample

router = APIRouter(prefix="/connectors", tags=["connectors"])


# ── Shared analysis runner ────────────────────────────────────────────────────
def _run_analysis(df: pd.DataFrame, source_name: str, user: User, db):
    profile = profile_dataframe(df)
    quality = calculate_quality_score(df)
    ticket_analysis = analyze_tickets(df)
    schema_validation = validate_ticket_schema(df)
    opportunities = generate_opportunities(df, ticket_analysis)
    bottlenecks = detect_bottlenecks(df, ticket_analysis)
    impact_analysis = estimate_business_impact(opportunities)
    ticket_clusters = cluster_ticket_issues(df, ticket_analysis)
    ai_advisor_report = generate_ai_advisor_report(
        profile, quality, ticket_analysis, opportunities,
        bottlenecks, impact_analysis, ticket_clusters, schema_validation,
    )
    executive_summary = generate_summary(profile, quality, ticket_analysis, opportunities)

    run = AnalysisRun(
        user_id=user.id,
        filename=source_name,
        rows=profile["rows"],
        columns=profile["columns"],
        quality_score=quality["quality_score"],
        grade=quality["grade"],
        profile=profile,
        quality=quality,
        ticket_analysis=ticket_analysis,
        opportunities=opportunities,
        executive_summary=executive_summary,
        bottlenecks=bottlenecks,
        impact_analysis=impact_analysis,
        ticket_clusters=ticket_clusters,
        schema_validation=schema_validation,
        ai_advisor_report=ai_advisor_report,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    analysis_payload = {
        "profile": profile, "quality": quality, "ticket_analysis": ticket_analysis,
        "opportunities": opportunities, "bottlenecks": bottlenecks,
        "impact_analysis": impact_analysis, "ticket_clusters": ticket_clusters,
        "schema_validation": schema_validation, "ai_advisor_report": ai_advisor_report,
    }
    embed_run_data(run.id, source_name, analysis_payload)
    try:
        embed_csv_sample(run.id, source_name, df.head(50).to_csv(index=False))
    except Exception:
        pass

    return {
        "run_id": run.id,
        "filename": source_name,
        "profile": profile,
        "quality": quality,
        "ticket_analysis": ticket_analysis,
        "opportunities": opportunities,
        "executive_summary": executive_summary,
        "bottlenecks": bottlenecks,
        "impact_analysis": impact_analysis,
        "ticket_clusters": ticket_clusters,
        "schema_validation": schema_validation,
        "ai_advisor_report": ai_advisor_report,
    }


# ── Jira ─────────────────────────────────────────────────────────────────────
class JiraRequest(BaseModel):
    jira_url: str          # e.g. https://yourcompany.atlassian.net
    email: str
    api_token: str
    project_key: Optional[str] = None   # e.g. "IT" — leave blank for all
    max_issues: int = 500


@router.post("/jira/fetch")
def fetch_jira(body: JiraRequest, current_user: User = Depends(get_current_user), db=Depends(get_db)):
    base = body.jira_url.rstrip("/")
    auth = HTTPBasicAuth(body.email, body.api_token)
    headers = {"Accept": "application/json"}

    jql = f"project = {body.project_key}" if body.project_key else "ORDER BY created DESC"
    fields = "summary,status,priority,assignee,reporter,created,resolutiondate,issuetype,labels,comment"

    issues = []
    start = 0
    batch = 100

    while len(issues) < body.max_issues:
        url = f"{base}/rest/api/3/search"
        params = {
            "jql": jql,
            "startAt": start,
            "maxResults": min(batch, body.max_issues - len(issues)),
            "fields": fields,
        }
        try:
            resp = requests.get(url, headers=headers, auth=auth, params=params, timeout=15)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Jira: {e}")

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid Jira credentials")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Jira access denied — check permissions")
        if not resp.ok:
            raise HTTPException(status_code=502, detail=f"Jira API error: {resp.text[:200]}")

        data = resp.json()
        batch_issues = data.get("issues", [])
        issues.extend(batch_issues)

        if len(batch_issues) < batch or len(issues) >= data.get("total", 0):
            break
        start += batch

    if not issues:
        raise HTTPException(status_code=404, detail="No issues found for the given project/query")

    # Map to standard schema
    rows = []
    for issue in issues:
        f = issue.get("fields", {})
        created = f.get("created", "")[:10] if f.get("created") else None
        resolved = f.get("resolutiondate", "")[:10] if f.get("resolutiondate") else None

        # Calculate resolution time in hours
        resolution_hours = None
        if created and resolved:
            try:
                from datetime import datetime
                c = datetime.fromisoformat(f["created"].replace("Z", "+00:00"))
                r = datetime.fromisoformat(f["resolutiondate"].replace("Z", "+00:00"))
                resolution_hours = round((r - c).total_seconds() / 3600, 1)
            except Exception:
                pass

        rows.append({
            "ticket_id": issue.get("key"),
            "summary": f.get("summary", ""),
            "status": f.get("status", {}).get("name", "") if f.get("status") else "",
            "priority": f.get("priority", {}).get("name", "") if f.get("priority") else "",
            "assignee": f.get("assignee", {}).get("displayName", "") if f.get("assignee") else "Unassigned",
            "reporter": f.get("reporter", {}).get("displayName", "") if f.get("reporter") else "",
            "department": body.project_key or "Jira",
            "category": f.get("issuetype", {}).get("name", "") if f.get("issuetype") else "",
            "created_date": created,
            "resolved_date": resolved,
            "resolution_time_hours": resolution_hours,
            "labels": ", ".join(f.get("labels", [])),
        })

    df = pd.DataFrame(rows)
    source_name = f"jira_{body.project_key or 'all'}_{len(issues)}_issues.csv"
    return _run_analysis(df, source_name, current_user, db)


# ── Zendesk ───────────────────────────────────────────────────────────────────
class ZendeskRequest(BaseModel):
    subdomain: str         # e.g. "yourcompany" from yourcompany.zendesk.com
    email: str
    api_token: str
    max_tickets: int = 500


@router.post("/zendesk/fetch")
def fetch_zendesk(body: ZendeskRequest, current_user: User = Depends(get_current_user), db=Depends(get_db)):
    base = f"https://{body.subdomain}.zendesk.com/api/v2"
    auth = HTTPBasicAuth(f"{body.email}/token", body.api_token)
    headers = {"Accept": "application/json"}

    tickets = []
    url = f"{base}/tickets.json?per_page=100&sort_by=created_at&sort_order=desc"

    while url and len(tickets) < body.max_tickets:
        try:
            resp = requests.get(url, headers=headers, auth=auth, timeout=15)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Zendesk: {e}")

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid Zendesk credentials")
        if not resp.ok:
            raise HTTPException(status_code=502, detail=f"Zendesk API error: {resp.text[:200]}")

        data = resp.json()
        batch = data.get("tickets", [])
        tickets.extend(batch[:body.max_tickets - len(tickets)])
        url = data.get("next_page") if len(tickets) < body.max_tickets else None

    if not tickets:
        raise HTTPException(status_code=404, detail="No tickets found")

    # Priority mapping
    priority_map = {"urgent": "P1", "high": "P2", "normal": "P3", "low": "P4", None: "P3"}

    rows = []
    for t in tickets:
        created = t.get("created_at", "")[:10] if t.get("created_at") else None
        solved = t.get("solved_at") or t.get("updated_at")
        resolved = solved[:10] if solved and t.get("status") in ("solved", "closed") else None

        resolution_hours = None
        if created and resolved:
            try:
                from datetime import datetime
                c = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
                r = datetime.fromisoformat(solved.replace("Z", "+00:00"))
                resolution_hours = round((r - c).total_seconds() / 3600, 1)
            except Exception:
                pass

        rows.append({
            "ticket_id": str(t.get("id")),
            "summary": t.get("subject", ""),
            "status": t.get("status", "").capitalize(),
            "priority": priority_map.get(t.get("priority"), "P3"),
            "assignee": str(t.get("assignee_id", "Unassigned")),
            "department": t.get("type", "Support") or "Support",
            "category": t.get("type", "Question") or "Question",
            "created_date": created,
            "resolved_date": resolved,
            "resolution_time_hours": resolution_hours,
            "channel": t.get("via", {}).get("channel", "") if t.get("via") else "",
        })

    df = pd.DataFrame(rows)
    source_name = f"zendesk_{body.subdomain}_{len(tickets)}_tickets.csv"
    return _run_analysis(df, source_name, current_user, db)


# ── Test connection endpoints ─────────────────────────────────────────────────
@router.post("/jira/test")
def test_jira(body: JiraRequest, current_user: User = Depends(get_current_user)):
    base = body.jira_url.rstrip("/")
    auth = HTTPBasicAuth(body.email, body.api_token)
    try:
        resp = requests.get(f"{base}/rest/api/3/myself", auth=auth, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {"success": True, "user": data.get("displayName", "Connected")}
        return {"success": False, "error": "Invalid credentials"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/zendesk/test")
def test_zendesk(body: ZendeskRequest, current_user: User = Depends(get_current_user)):
    base = f"https://{body.subdomain}.zendesk.com/api/v2"
    auth = HTTPBasicAuth(f"{body.email}/token", body.api_token)
    try:
        resp = requests.get(f"{base}/users/me.json", auth=auth, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            name = data.get("user", {}).get("name", "Connected")
            return {"success": True, "user": name}
        return {"success": False, "error": "Invalid credentials"}
    except Exception as e:
        return {"success": False, "error": str(e)}
