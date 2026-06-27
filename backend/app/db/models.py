from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_admin = Column(Integer, default=0)  # 1 = admin
    created_at = Column(DateTime, default=datetime.utcnow)

    runs = relationship("AnalysisRun", back_populates="user")


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable for backward compat

    filename = Column(String, nullable=False)
    rows = Column(Integer, nullable=False)
    columns = Column(Integer, nullable=False)
    quality_score = Column(Float, nullable=False)
    grade = Column(String, nullable=False)

    profile = Column(JSON, nullable=False)
    quality = Column(JSON, nullable=False)
    ticket_analysis = Column(JSON, nullable=True)
    opportunities = Column(JSON, nullable=True)
    executive_summary = Column(JSON, nullable=True)
    bottlenecks = Column(JSON, nullable=True)
    impact_analysis = Column(JSON, nullable=True)
    ticket_clusters = Column(JSON, nullable=True)
    schema_validation = Column(JSON, nullable=True)
    ai_advisor_report = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="runs")
