import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    # backend/app/../ -> backend/
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

BASE_DIR = get_base_dir()
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "notemind.db")

if os.name == 'nt':
    # Windows absolute path handling for SQLAlchemy
    DEFAULT_DB_URL = f"sqlite:///{DEFAULT_DB_PATH}"
else:
    # Linux/Unix absolute path (note 4 slashes total: sqlite:// + /absolute/path)
    DEFAULT_DB_URL = f"sqlite:////{DEFAULT_DB_PATH}"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
