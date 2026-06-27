"""
Admin-only endpoints — all require is_admin = 1.
GET  /admin/stats        — platform-wide KPIs
GET  /admin/users        — all users + their usage
GET  /admin/runs         — all runs across all users
POST /admin/make-admin   — promote a user to admin by email
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_db, get_admin_user
from app.db.models import User, AnalysisRun

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(get_admin_user)):
    total_users = db.query(func.count(User.id)).scalar()
    total_runs = db.query(func.count(AnalysisRun.id)).scalar()
    avg_quality = db.query(func.avg(AnalysisRun.quality_score)).scalar()
    total_rows = db.query(func.sum(AnalysisRun.rows)).scalar()

    # Grade distribution
    grades = db.query(AnalysisRun.grade, func.count(AnalysisRun.id))\
               .group_by(AnalysisRun.grade).all()
    grade_dist = {g: c for g, c in grades}

    # Runs per day (last 7 days)
    from datetime import datetime, timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_runs = db.query(AnalysisRun)\
                    .filter(AnalysisRun.created_at >= seven_days_ago)\
                    .order_by(AnalysisRun.created_at.asc()).all()

    daily: dict[str, int] = {}
    for r in recent_runs:
        day = r.created_at.strftime("%Y-%m-%d")
        daily[day] = daily.get(day, 0) + 1

    return {
        "total_users": total_users or 0,
        "total_runs": total_runs or 0,
        "avg_quality_score": round(avg_quality or 0, 1),
        "total_rows_analysed": total_rows or 0,
        "grade_distribution": grade_dist,
        "runs_last_7_days": daily,
    }


@router.get("/users")
def get_users(db: Session = Depends(get_db), _=Depends(get_admin_user)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        run_count = db.query(func.count(AnalysisRun.id))\
                      .filter(AnalysisRun.user_id == u.id).scalar()
        last_run = db.query(AnalysisRun)\
                     .filter(AnalysisRun.user_id == u.id)\
                     .order_by(AnalysisRun.created_at.desc()).first()
        result.append({
            "user_id": u.id,
            "email": u.email,
            "full_name": u.full_name or "",
            "is_admin": bool(u.is_admin),
            "created_at": u.created_at,
            "run_count": run_count or 0,
            "last_active": last_run.created_at if last_run else None,
        })
    return result


@router.get("/runs")
def get_all_runs(db: Session = Depends(get_db), _=Depends(get_admin_user)):
    runs = db.query(AnalysisRun).order_by(AnalysisRun.created_at.desc()).limit(100).all()
    result = []
    for r in runs:
        user = db.query(User).filter(User.id == r.user_id).first()
        result.append({
            "run_id": r.id,
            "filename": r.filename,
            "rows": r.rows,
            "quality_score": r.quality_score,
            "grade": r.grade,
            "created_at": r.created_at,
            "user_email": user.email if user else "unknown",
            "user_name": user.full_name if user else "",
        })
    return result


@router.post("/make-admin")
def make_admin(body: dict, db: Session = Depends(get_db), _=Depends(get_admin_user)):
    email = body.get("email")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = 1
    db.commit()
    return {"success": True, "message": f"{email} is now an admin"}
