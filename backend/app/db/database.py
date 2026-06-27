import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Railway provides DATABASE_URL automatically when you add a PostgreSQL plugin.
# Falls back to SQLite for local development.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./veracity.db")

# Railway PostgreSQL URLs start with "postgres://" but SQLAlchemy needs "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite needs check_same_thread=False; PostgreSQL doesn't need it
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
