import os
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

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
from app.rag_engine import embed_run_data, embed_csv_sample, seed_knowledge_base

from app.db.database import Base, engine, SessionLocal
from app.db.models import AnalysisRun, User
from app.auth import get_current_user, get_db
from app.routers.auth_router import router as auth_router
from app.routers.chat_router import router as chat_router

# ── DB init ──────────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Veracity API", version="2.0.0")

allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(chat_router)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    """Seed knowledge base on startup (idempotent)."""
    seed_knowledge_base()


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/")
def home():
    return {"message": "Veracity API v2 is running", "auth": "enabled", "rag": "enabled"}


# ── Upload (protected) ────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported right now")

    df = pd.read_csv(file.file)

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
        user_id=current_user.id,
        filename=file.filename,
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

    # ── Embed for RAG (non-blocking) ──────────────────────────────────────
    analysis_payload = {
        "profile": profile, "quality": quality, "ticket_analysis": ticket_analysis,
        "opportunities": opportunities, "bottlenecks": bottlenecks,
        "impact_analysis": impact_analysis, "ticket_clusters": ticket_clusters,
        "schema_validation": schema_validation, "ai_advisor_report": ai_advisor_report,
    }
    embed_run_data(run.id, file.filename, analysis_payload)

    try:
        csv_sample = df.head(50).to_csv(index=False)
        embed_csv_sample(run.id, file.filename, csv_sample)
    except Exception:
        pass

    return {
        "run_id": run.id,
        "filename": file.filename,
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


# ── Runs list (protected, user-scoped) ────────────────────────────────────────
@app.get("/runs")
def get_runs(current_user: User = Depends(get_current_user), db=Depends(get_db)):
    runs = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.user_id == current_user.id)
        .order_by(AnalysisRun.created_at.desc())
        .all()
    )
    return [
        {
            "run_id": r.id,
            "filename": r.filename,
            "rows": r.rows,
            "columns": r.columns,
            "quality_score": r.quality_score,
            "grade": r.grade,
            "created_at": r.created_at,
        }
        for r in runs
    ]


# ── Single run (protected, user-scoped) ───────────────────────────────────────
@app.get("/runs/{run_id}")
def get_run(run_id: int, current_user: User = Depends(get_current_user), db=Depends(get_db)):
    run = db.query(AnalysisRun).filter(
        AnalysisRun.id == run_id,
        AnalysisRun.user_id == current_user.id,
    ).first()

    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "run_id": run.id,
        "filename": run.filename,
        "rows": run.rows,
        "columns": run.columns,
        "quality_score": run.quality_score,
        "grade": run.grade,
        "profile": run.profile,
        "quality": run.quality,
        "ticket_analysis": run.ticket_analysis,
        "opportunities": run.opportunities,
        "executive_summary": run.executive_summary,
        "created_at": run.created_at,
        "bottlenecks": run.bottlenecks,
        "impact_analysis": run.impact_analysis,
        "ticket_clusters": run.ticket_clusters,
        "schema_validation": run.schema_validation,
        "ai_advisor_report": run.ai_advisor_report,
    }
