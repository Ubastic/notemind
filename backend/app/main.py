import json
import logging
import os
import re
import secrets
import shutil
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from .time_utils import ensure_beijing_tz, now_beijing

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session, defer

from . import ai, crypto, models, schemas, security
from .database import DATABASE_URL, SessionLocal, engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEMANTIC_SIMILARITY_THRESHOLD = float(os.getenv("SEMANTIC_SIMILARITY_THRESHOLD", "0.2"))
SHORT_TITLE_MAX_LEN = int(os.getenv("SHORT_TITLE_MAX_LEN", "32"))
AI_FEATURE_ENABLED = os.getenv("AI_ENABLED", "false").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
ANON_TAG_PATTERN = re.compile(r"anon_[0-9a-f]{8}", re.IGNORECASE)
RELATED_KEYWORD_LIMIT = int(os.getenv("RELATED_KEYWORD_LIMIT", "12"))
RELATED_DEFAULT_LIMIT = int(os.getenv("RELATED_NOTES_LIMIT", "6"))
WORD_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{2,}")
CJK_TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,}")
ATTACHMENT_REF_PATTERN = re.compile(r"/api/attachments/(\d+)")
DEFAULT_CATEGORIES = [
    {"key": "credential", "label": "Credentials"},
    {"key": "work", "label": "Work"},
    {"key": "idea", "label": "Ideas"},
    {"key": "todo", "label": "Todo"},
]
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Determine storage directory for persistent uploads
if getattr(sys, "frozen", False):
    # In PyInstaller bundle, use the executable directory for persistence
    _STORAGE_ROOT = os.path.dirname(sys.executable)
else:
    # In development, use the backend directory
    _STORAGE_ROOT = BASE_DIR

UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(_STORAGE_ROOT, "storage")))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "access_token")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in ("1", "true", "yes", "on")

models.Base.metadata.create_all(bind=engine)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# SQLite performance optimizations
if DATABASE_URL.startswith("sqlite"):
    with engine.begin() as connection:
        connection.execute(text("PRAGMA journal_mode=WAL"))
        connection.execute(text("PRAGMA synchronous=NORMAL"))
        connection.execute(text("PRAGMA cache_size=-64000"))
        connection.execute(text("PRAGMA temp_store=MEMORY"))
        connection.execute(text("PRAGMA mmap_size=268435456"))  # 256MB memory-mapped I/O
        connection.execute(text("PRAGMA wal_autocheckpoint=1000"))  # Checkpoint every 1000 pages
        connection.execute(text("PRAGMA busy_timeout=5000"))  # 5 second timeout for locks
        # Update query planner statistics
        connection.execute(text("ANALYZE"))


def _ensure_notes_title_column() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("notes")}
    if "title" in columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE notes ADD COLUMN title VARCHAR"))


_ensure_notes_title_column()


def _ensure_notes_short_title_column() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("notes")}
    if "short_title" in columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE notes ADD COLUMN short_title VARCHAR"))


_ensure_notes_short_title_column()


def _ensure_notes_completed_column() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("notes")}
    if "completed" in columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE notes ADD COLUMN completed BOOLEAN DEFAULT 0"))


_ensure_notes_completed_column()


def _ensure_notes_folder_column() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("notes")}
    if "folder" in columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE notes ADD COLUMN folder VARCHAR"))


_ensure_notes_folder_column()


def _ensure_notes_pinning_columns() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("notes")}
    
    with engine.begin() as connection:
        if "pinned_global" not in columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN pinned_global BOOLEAN DEFAULT 0"))
        if "pinned_category" not in columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN pinned_category BOOLEAN DEFAULT 0"))
        if "pinned_at" not in columns:
            connection.execute(text("ALTER TABLE notes ADD COLUMN pinned_at DATETIME"))


_ensure_notes_pinning_columns()

def _ensure_notes_indexes() -> None:
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_notes_user_created_at "
                "ON notes(user_id, created_at)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_notes_user_category_created_at "
                "ON notes(user_id, ai_category, created_at)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_notes_user_completed_created_at "
                "ON notes(user_id, completed, created_at)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_notes_completed "
                "ON notes(completed) WHERE completed IS NOT NULL AND completed = 1"
            )
        )


_ensure_notes_indexes()

# Periodic ANALYZE for query planner optimization
if DATABASE_URL.startswith("sqlite"):
    try:
        with engine.begin() as connection:
            # Check if we need to run ANALYZE (check sqlite_stat1 table age)
            result = connection.execute(text(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'"
            )).scalar()
            if result == 0:
                connection.execute(text("ANALYZE"))
    except Exception as e:
        logger.warning(f"Failed to run ANALYZE: {e}")

app = FastAPI(title="NoteMind API", version="0.1.0")

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return token
    cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    return None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> models.User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = security.decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _get_user_from_request(request: Request, db: Session) -> Optional[models.User]:
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = security.decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()


def _sanitize_filename(name: str) -> str:
    return os.path.basename(str(name or "").strip()) or "file"


def _build_attachment_url(attachment_id: int) -> str:
    return f"/api/attachments/{attachment_id}"


def _extract_attachment_ids(content: Optional[str]) -> List[int]:
    if not content:
        return []
    ids: List[int] = []
    seen = set()
    for match in ATTACHMENT_REF_PATTERN.finditer(str(content)):
        raw = match.group(1)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value <= 0 or value in seen:
            continue
        ids.append(value)
        seen.add(value)
    return ids


def _sync_note_attachments(
    db: Session,
    current_user: models.User,
    note: models.Note,
    content: Optional[str],
) -> None:
    desired_ids = set(_extract_attachment_ids(content))
    existing_rows = (
        db.query(models.NoteAttachment)
        .filter(models.NoteAttachment.note_id == note.id)
        .all()
    )
    existing_ids = {row.attachment_id for row in existing_rows}

    to_remove = existing_ids - desired_ids
    to_add = desired_ids - existing_ids

    if to_remove:
        (
            db.query(models.NoteAttachment)
            .filter(
                models.NoteAttachment.note_id == note.id,
                models.NoteAttachment.attachment_id.in_(list(to_remove)),
            )
            .delete(synchronize_session=False)
        )

        attachments_to_update = (
            db.query(models.Attachment)
            .filter(
                models.Attachment.user_id == current_user.id,
                models.Attachment.id.in_(list(to_remove)),
                models.Attachment.note_id == note.id,
            )
            .all()
        )
        for attachment in attachments_to_update:
            replacement = (
                db.query(models.NoteAttachment.note_id)
                .filter(models.NoteAttachment.attachment_id == attachment.id)
                .order_by(models.NoteAttachment.created_at.desc())
                .first()
            )
            attachment.note_id = replacement[0] if replacement else None

    if not to_add:
        return

    owned_ids = {
        row[0]
        for row in (
            db.query(models.Attachment.id)
            .filter(
                models.Attachment.user_id == current_user.id,
                models.Attachment.id.in_(list(to_add)),
            )
            .all()
        )
    }
    for attachment_id in owned_ids:
        db.add(models.NoteAttachment(note_id=note.id, attachment_id=attachment_id))

    attachments_added = (
        db.query(models.Attachment)
        .filter(
            models.Attachment.user_id == current_user.id,
            models.Attachment.id.in_(list(owned_ids)),
        )
        .all()
    )
    for attachment in attachments_added:
        if attachment.note_id is None:
            attachment.note_id = note.id


def _safe_json_loads(value: Optional[str], default: Any):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return False


def _normalize_categories(raw: Any) -> List[Dict[str, str]]:
    if not isinstance(raw, list):
        return []
    normalized: List[Dict[str, str]] = []
    seen = set()
    for item in raw:
        if isinstance(item, dict):
            raw_key = item.get("key")
            raw_label = item.get("label")
        elif isinstance(item, str):
            raw_key = item
            raw_label = item
        elif hasattr(item, "key") or hasattr(item, "label"):
            raw_key = getattr(item, "key", None)
            raw_label = getattr(item, "label", None)
        else:
            continue
        key = str(raw_key or "").strip().lower()
        label = str(raw_label or "").strip()
        if not key or key in seen:
            continue
        if not label:
            label = key
        normalized.append({"key": key, "label": label})
        seen.add(key)
    return normalized


def _load_user_settings_payload(user: models.User) -> Dict[str, Any]:
    if not user.settings or not user.settings.payload:
        return {}
    payload = _safe_json_loads(user.settings.payload, {})
    return payload if isinstance(payload, dict) else {}


def _get_user_categories(user: models.User) -> List[Dict[str, str]]:
    payload = _load_user_settings_payload(user)
    categories = _normalize_categories(payload.get("categories"))
    return categories or DEFAULT_CATEGORIES


def _get_allowed_category_keys(user: models.User) -> List[str]:
    return [item["key"] for item in _get_user_categories(user)]


def _get_user_ai_enabled(user: models.User) -> bool:
    payload = _load_user_settings_payload(user)
    return _normalize_bool(payload.get("ai_enabled"))


def _is_ai_enabled_for_user(user: models.User) -> bool:
    return AI_FEATURE_ENABLED and _get_user_ai_enabled(user)


def _fallback_category(allowed: List[str]) -> str:
    if "idea" in allowed:
        return "idea"
    return allowed[0] if allowed else "idea"


def _select_category(
    allowed: List[str],
    override: Optional[str],
    analyzed: Optional[str],
) -> str:
    override_key = str(override or "").strip().lower()
    if override_key in allowed:
        return override_key
    analyzed_key = str(analyzed or "").strip().lower()
    if analyzed_key in allowed:
        return analyzed_key
    return _fallback_category(allowed)


def _restore_mapping_in_obj(data: Any, mapping: Dict[str, str]) -> Any:
    if isinstance(data, str):
        restored = data
        for placeholder, original in mapping.items():
            restored = restored.replace(placeholder, original)
        return restored
    if isinstance(data, list):
        return [_restore_mapping_in_obj(item, mapping) for item in data]
    if isinstance(data, dict):
        return {k: _restore_mapping_in_obj(v, mapping) for k, v in data.items()}
    return data


def _note_to_schema(
    note: models.Note,
    key: bytes,
    search_info: Optional[schemas.SearchInfo] = None,
    include_content: bool = True,
) -> schemas.NoteOut:
    content = ""
    if include_content:
        content = (
            crypto.decrypt_content(note.content, key) if note.content_encrypted else note.content
        )
        if content is None:
            content = ""
    tags = _normalize_tags(_safe_json_loads(note.ai_tags, []))
    entities = _safe_json_loads(note.ai_entities, {})
    if not isinstance(entities, dict):
        entities = {}
    return schemas.NoteOut(
        id=note.id,
        title=note.title,
        short_title=note.short_title,
        content=content,
        completed=bool(getattr(note, "completed", False)),
        ai_category=note.ai_category,
        folder=getattr(note, "folder", None),
        ai_summary=note.ai_summary,
        ai_tags=tags,
        ai_entities=entities,
        ai_sensitivity=note.ai_sensitivity,
        search_info=search_info,
        pinned_global=bool(getattr(note, "pinned_global", False)),
        pinned_category=bool(getattr(note, "pinned_category", False)),
        pinned_at=getattr(note, "pinned_at", None),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _note_matches_query(note: models.Note, query: str, key: bytes) -> bool:
    query_lower = query.lower()
    title = note.title or ""
    if title and query_lower in title.lower():
        return True
    short_title = note.short_title or ""
    if short_title and query_lower in short_title.lower():
        return True
    content = crypto.decrypt_content(note.content, key) if note.content_encrypted else note.content
    if content and query_lower in content.lower():
        return True
    summary = note.ai_summary or ""
    if summary and query_lower in summary.lower():
        return True
    tags = _safe_json_loads(note.ai_tags, [])
    if isinstance(tags, list):
        if any(query_lower in str(tag).lower() for tag in tags):
            return True
    elif isinstance(tags, str) and query_lower in tags.lower():
        return True
    entities = _safe_json_loads(note.ai_entities, {})
    if isinstance(entities, dict):
        for key_text, value_text in entities.items():
            if query_lower in str(key_text).lower() or query_lower in str(value_text).lower():
                return True
    elif isinstance(entities, str) and query_lower in entities.lower():
        return True
    return False


def _note_matches_keywords(note: models.Note, keywords: List[str], key: bytes) -> bool:
    for keyword in keywords:
        if keyword and _note_matches_query(note, keyword, key):
            return True
    return False


def _note_matching_keywords(note: models.Note, keywords: List[str], key: bytes) -> List[str]:
    matches: List[str] = []
    seen = set()
    for keyword in keywords:
        cleaned = str(keyword or "").strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        if _note_matches_query(note, cleaned, key):
            matches.append(cleaned)
        seen.add(lowered)
    return matches


def _dedupe_keywords(items: List[str], limit: int) -> List[str]:
    deduped: List[str] = []
    seen = set()
    for item in items:
        cleaned = str(item or "").strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(cleaned)
        if len(deduped) >= limit:
            break
    return deduped


def _extract_keywords_from_text(text: Optional[str], limit: int = 6) -> List[str]:
    if not text:
        return []
    raw = str(text)
    lowered = raw.lower()
    tokens = WORD_TOKEN_PATTERN.findall(lowered)
    if len(tokens) < limit:
        for block in CJK_TOKEN_PATTERN.findall(raw):
            if len(tokens) >= limit:
                break
            if len(block) <= 4:
                tokens.append(block)
                continue
            for i in range(0, len(block) - 1):
                tokens.append(block[i : i + 2])
                if len(tokens) >= limit:
                    break
    if not tokens:
        cleaned = " ".join(raw.split()).strip()
        if cleaned:
            tokens.append(cleaned)
    return tokens[:limit]


def _build_related_keywords(note: models.Note, key: bytes) -> List[str]:
    tokens: List[str] = []
    tags = _normalize_tags(_safe_json_loads(note.ai_tags, []))
    tokens.extend(tags)
    tokens.extend(_extract_keywords_from_text(note.title, limit=4))
    tokens.extend(_extract_keywords_from_text(note.short_title, limit=4))
    tokens.extend(_extract_keywords_from_text(note.ai_summary, limit=6))
    if len(tokens) < 6:
        content = crypto.decrypt_content(note.content, key) if note.content_encrypted else note.content
        first_line = _first_non_empty_line(content or "")
        tokens.extend(_extract_keywords_from_text(first_line, limit=6))
    return _dedupe_keywords(tokens, RELATED_KEYWORD_LIMIT)


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None


def _apply_time_filter(query, time_start: Optional[str], time_end: Optional[str]):
    start_dt = _parse_date(time_start)
    end_dt = _parse_date(time_end)
    if start_dt:
        query = query.filter(models.Note.created_at >= start_dt)
    if end_dt:
        query = query.filter(models.Note.created_at < (end_dt + timedelta(days=1)))
    return query


def _parse_embedding(raw: Optional[str]) -> Optional[List[float]]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, list):
        return None
    embedding = [float(value) for value in data if isinstance(value, (int, float))]
    return embedding or None


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _is_anonymous_tag(value: str) -> bool:
    return bool(ANON_TAG_PATTERN.search(value))


def _normalize_tags(tags: Any) -> List[str]:
    if isinstance(tags, list):
        normalized: List[str] = []
        for tag in tags:
            cleaned = str(tag).strip()
            if not cleaned or _is_anonymous_tag(cleaned):
                continue
            normalized.append(cleaned)
        return normalized
    if isinstance(tags, str):
        cleaned = tags.strip()
        if not cleaned or _is_anonymous_tag(cleaned):
            return []
        return [cleaned]
    return []


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _tag_like_pattern(tag: str) -> str:
    token = json.dumps(tag, ensure_ascii=True)
    return f"%{_escape_like(token)}%"


def _anonymize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    text = str(value)
    if not text:
        return ""
    anonymized, _ = ai.anonymize_sensitive_data(text)
    return anonymized


def _build_embedding_source(
    content: str, summary: Optional[str], tags: Any, title: Optional[str] = None
) -> str:
    parts = [content]
    if title:
        parts.append(f"Title: {title}")
    if summary:
        parts.append(f"Summary: {summary}")
    normalized_tags = _normalize_tags(tags)
    if normalized_tags:
        parts.append(f"Tags: {', '.join(normalized_tags)}")
    return "\n".join(parts)


def _normalize_title(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _normalize_short_title(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    if not cleaned:
        return None
    if len(cleaned) <= SHORT_TITLE_MAX_LEN:
        return cleaned
    trimmed = cleaned[:SHORT_TITLE_MAX_LEN].rstrip()
    if " " in trimmed:
        trimmed = trimmed.rsplit(" ", 1)[0].rstrip() or trimmed
    return trimmed


def _first_non_empty_line(content: str) -> str:
    if not content:
        return ""
    for line in content.splitlines():
        cleaned = line.strip()
        if cleaned:
            return cleaned
    return content.strip()


def _build_short_title(
    analysis: Optional[Dict[str, Any]],
    content: str,
    title: Optional[str],
    prefer_title: bool,
) -> Optional[str]:
    candidates: List[Any] = []
    if prefer_title and title:
        candidates.append(title)
    if isinstance(analysis, dict):
        analysis_short = analysis.get("short_title")
        if analysis_short:
            candidates.append(analysis_short)
        if not prefer_title and title:
            candidates.append(title)
        analysis_title = analysis.get("title")
        if analysis_title:
            candidates.append(analysis_title)
        analysis_summary = analysis.get("summary")
        if analysis_summary:
            candidates.append(analysis_summary)
    elif not prefer_title and title:
        candidates.append(title)
    if not candidates and title:
        candidates.append(title)
    content_line = _first_non_empty_line(content or "")
    if content_line:
        candidates.append(content_line)
    for candidate in candidates:
        normalized = _normalize_short_title(candidate)
        if normalized:
            return normalized
    return None


def _generate_title(analysis: Dict[str, Any], content: str) -> Optional[str]:
    candidate = str(analysis.get("title") or "").strip()
    if not candidate:
        candidate = str(analysis.get("summary") or "").strip()
    if not candidate:
        candidate = content.strip().splitlines()[0] if content.strip() else ""
    if not candidate:
        return None
    if len(candidate) > 80:
        candidate = candidate[:77] + "..."
    return candidate


def _semantic_search_notes(
    notes: List[models.Note],
    semantic_query: str,
    keywords: List[str],
    key: bytes,
    limit: int,
    offset: int,
    use_ai: bool,
    include_content: bool = True,
) -> Tuple[List[schemas.NoteOut], int]:
    keyword_list = keywords or [semantic_query]
    direct_query = (keyword_list[0] if keyword_list else semantic_query).strip()
    direct_query_lower = direct_query.lower()
    query_embedding = ai.get_embedding(semantic_query, use_ai=use_ai)
    ranked: List[Tuple[Tuple[float, float, float, float, float], float, models.Note, schemas.SearchInfo]] = []
    for note in notes:
        matched_keywords = _note_matching_keywords(note, keyword_list, key)
        text_match = bool(matched_keywords)
        matched_count = len(matched_keywords)
        direct_match = False
        if direct_query_lower:
            direct_match = any(item.lower() == direct_query_lower for item in matched_keywords)
        similarity = 0.0
        if query_embedding:
            note_embedding = _parse_embedding(note.embedding)
            if note_embedding:
                similarity = _cosine_similarity(query_embedding, note_embedding)
        score = similarity
        if text_match:
            score += 0.25
        if matched_count > 1:
            score += 0.05 * (matched_count - 1)
        if direct_match:
            score += 0.35
        has_semantic_match = bool(
            query_embedding and similarity >= SEMANTIC_SIMILARITY_THRESHOLD
        )
        if text_match or has_semantic_match:
            match_type = "keyword" if text_match else "semantic"
            if text_match and has_semantic_match:
                match_type = "keyword+semantic"
            rank_key = (
                1.0 if direct_match else 0.0,
                float(matched_count),
                1.0 if text_match else 0.0,
                similarity,
                score,
            )
            ranked.append(
                (
                    rank_key,
                    score,
                    note,
                    schemas.SearchInfo(
                        match_type=match_type,
                        matched_keywords=matched_keywords,
                        similarity=similarity,
                        score=score,
                    ),
                )
            )
    if not ranked and query_embedding:
        for note in notes:
            note_embedding = _parse_embedding(note.embedding)
            if note_embedding:
                similarity = _cosine_similarity(query_embedding, note_embedding)
                ranked.append(
                    (
                        (0.0, 0.0, 0.0, similarity, similarity),
                        similarity,
                        note,
                        schemas.SearchInfo(
                            match_type="semantic",
                            matched_keywords=[],
                            similarity=similarity,
                            score=similarity,
                        ),
                    )
                )
    ranked.sort(key=lambda item: item[0], reverse=True)
    total = len(ranked)
    sliced = ranked[offset : offset + limit]
    items = [
        _note_to_schema(note, key, search_info, include_content=include_content)
        for _, _, note, search_info in sliced
    ]
    return items, total


def _related_notes(
    note: models.Note,
    notes: List[models.Note],
    key: bytes,
    query_embedding: Optional[List[float]],
    limit: int,
) -> Tuple[List[schemas.NoteOut], int, str]:
    keywords = _build_related_keywords(note, key)
    direct_query = (keywords[0] if keywords else "").strip()
    direct_query_lower = direct_query.lower()
    ranked: List[
        Tuple[Tuple[float, float, float, float, float], float, models.Note, schemas.SearchInfo]
    ] = []
    used_semantic = False
    for candidate in notes:
        if candidate.id == note.id:
            continue
        matched_keywords = (
            _note_matching_keywords(candidate, keywords, key) if keywords else []
        )
        text_match = bool(matched_keywords)
        matched_count = len(matched_keywords)
        direct_match = False
        if direct_query_lower:
            direct_match = any(item.lower() == direct_query_lower for item in matched_keywords)
        similarity = 0.0
        if query_embedding:
            note_embedding = _parse_embedding(candidate.embedding)
            if note_embedding:
                similarity = _cosine_similarity(query_embedding, note_embedding)
        has_semantic_match = bool(
            query_embedding and similarity >= SEMANTIC_SIMILARITY_THRESHOLD
        )
        if has_semantic_match:
            used_semantic = True
        if not text_match and not has_semantic_match:
            continue
        score = similarity
        if text_match:
            score += 0.25
        if matched_count > 1:
            score += 0.05 * (matched_count - 1)
        if direct_match:
            score += 0.35
        match_type = "keyword" if text_match else "semantic"
        if text_match and has_semantic_match:
            match_type = "keyword+semantic"
        rank_key = (
            1.0 if direct_match else 0.0,
            float(matched_count),
            1.0 if text_match else 0.0,
            similarity,
            score,
        )
        ranked.append(
            (
                rank_key,
                score,
                candidate,
                schemas.SearchInfo(
                    match_type=match_type,
                    matched_keywords=matched_keywords,
                    similarity=similarity,
                    score=score,
                ),
            )
        )
    ranked.sort(key=lambda item: item[0], reverse=True)
    total = len(ranked)
    sliced = ranked[:limit]
    mode = "semantic" if used_semantic else "keyword"
    items = [
        _note_to_schema(candidate, key, search_info, include_content=False)
        for _, _, candidate, search_info in sliced
    ]
    return items, total, mode


@app.post("/api/auth/register", response_model=schemas.UserOut)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    salt = crypto.generate_salt()
    password_hash = security.get_password_hash(payload.password)
    user = models.User(username=payload.username, password_hash=password_hash, salt=salt)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=schemas.Token)
def login(payload: schemas.UserCreate, response: Response, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = security.create_access_token({"sub": str(user.id)})
    max_age = security.ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    return schemas.Token(access_token=token, token_type="bearer")


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/settings", response_model=schemas.UserSettings)
def get_settings(current_user: models.User = Depends(get_current_user)):
    return schemas.UserSettings(
        categories=_get_user_categories(current_user),
        ai_enabled=_is_ai_enabled_for_user(current_user),
    )


@app.put("/api/settings", response_model=schemas.UserSettings)
def update_settings(
    payload: schemas.UserSettings,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    categories = _normalize_categories(payload.categories)
    if payload.ai_enabled is None:
        ai_enabled = _get_user_ai_enabled(current_user)
    else:
        ai_enabled = _normalize_bool(payload.ai_enabled)
    if not AI_FEATURE_ENABLED:
        ai_enabled = False
    settings_payload: Dict[str, Any] = {"ai_enabled": ai_enabled}
    if categories:
        settings_payload["categories"] = categories
    payload_json = json.dumps(settings_payload)
    if current_user.settings:
        current_user.settings.payload = payload_json
    else:
        current_user.settings = models.UserSettings(user_id=current_user.id, payload=payload_json)
        db.add(current_user.settings)
    db.commit()
    return schemas.UserSettings(
        categories=categories or DEFAULT_CATEGORIES,
        ai_enabled=ai_enabled,
    )


@app.post("/api/notes", response_model=schemas.NoteOut)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    anonymized, mapping = ai.anonymize_sensitive_data(payload.content)
    allowed_categories = _get_allowed_category_keys(current_user)
    use_ai = _is_ai_enabled_for_user(current_user)
    analysis_anonymized = ai.analyze_note(
        anonymized,
        categories=allowed_categories,
        use_ai=use_ai,
    )
    analysis = _restore_mapping_in_obj(analysis_anonymized, mapping)

    title = _normalize_title(payload.title)
    if not title and isinstance(analysis, dict):
        title = _generate_title(analysis, payload.content)
    short_title = _build_short_title(
        analysis if isinstance(analysis, dict) else None,
        payload.content,
        title,
        prefer_title=bool(payload.title),
    )
    override_key = str(payload.category or "").strip().lower()
    if override_key in allowed_categories:
        category = override_key
    elif not use_ai:
        category = allowed_categories[0] if allowed_categories else "idea"
    else:
        category = _select_category(allowed_categories, None, analysis.get("category"))
    tags = _normalize_tags(analysis.get("tags") or [])
    summary = analysis.get("summary") or payload.content[:120]
    summary = str(summary)
    entities = analysis.get("entities") or {}
    if not isinstance(entities, dict):
        entities = {}
    sensitivity = analysis.get("sensitivity") or ("high" if ai.detect_sensitive(payload.content) else "low")

    title_source = None
    if isinstance(analysis_anonymized, dict):
        title_source = analysis_anonymized.get("title")
    if not title_source and payload.title:
        title_source, _ = ai.anonymize_sensitive_data(payload.title)

    embedding_source = _build_embedding_source(
        anonymized,
        analysis_anonymized.get("summary") if isinstance(analysis_anonymized, dict) else None,
        analysis_anonymized.get("tags") if isinstance(analysis_anonymized, dict) else None,
        title_source,
    )
    embedding = ai.get_embedding(embedding_source, already_anonymized=True, use_ai=use_ai)
    embedding_json = json.dumps(embedding) if embedding else None

    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    encrypted = crypto.encrypt_content(payload.content, key)

    note = models.Note(
        user_id=current_user.id,
        content=encrypted,
        content_encrypted=True,
        title=title,
        short_title=short_title,
        ai_category=category,
        folder=payload.folder,
        ai_summary=summary,
        ai_tags=json.dumps(tags),
        ai_entities=json.dumps(entities),
        ai_sensitivity=sensitivity,
        embedding=embedding_json,
        created_at=now_beijing(),
        updated_at=now_beijing(),
    )
    db.add(note)
    db.flush()
    _sync_note_attachments(db, current_user, note, payload.content)
    db.commit()
    db.refresh(note)
    return _note_to_schema(note, key)


@app.get("/api/notes", response_model=schemas.NoteListOut)
def list_notes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category: Optional[str] = None,
    folder: Optional[str] = None,
    tag: Optional[str] = None,
    q: Optional[str] = None,
    time_start: Optional[str] = None,
    time_end: Optional[str] = None,
    include_content: bool = Query(default=False),
    include_completed: bool = Query(default=False),
):
    query = db.query(models.Note).filter(models.Note.user_id == current_user.id)
    if not include_completed:
        query = query.filter(or_(models.Note.completed.is_(None), models.Note.completed.is_(False)))
    use_ai = _is_ai_enabled_for_user(current_user)
    if category:
        query = query.filter(models.Note.ai_category == category)
    if folder:
        query = query.filter(models.Note.folder == folder)
    if tag:
        cleaned_tag = str(tag or "").strip()
        if cleaned_tag:
            query = query.filter(
                models.Note.ai_tags.ilike(_tag_like_pattern(cleaned_tag), escape="\\")
            )
    if q:
        search_meta = ai.parse_search_query(q, use_ai=use_ai)
        semantic_query = search_meta.get("semantic_query") or q
        keywords = search_meta.get("keywords") or [semantic_query]
        query = _apply_time_filter(query, search_meta.get("time_start"), search_meta.get("time_end"))
        query = _apply_time_filter(query, time_start, time_end)
        notes = query.order_by(models.Note.created_at.desc()).all()
        key = crypto.derive_key(current_user.password_hash, current_user.salt)
        start = (page - 1) * page_size
        items, total = _semantic_search_notes(
            notes,
            semantic_query,
            keywords,
            key,
            page_size,
            start,
            use_ai=use_ai,
            include_content=include_content,
        )
        return schemas.NoteListOut(items=items, total=total, page=page, page_size=page_size)
    query = _apply_time_filter(query, time_start, time_end)
    notes_query = query.options(defer(models.Note.embedding))
    if not include_content:
        notes_query = notes_query.options(
            defer(models.Note.content),
            defer(models.Note.content_encrypted),
        )
    # Sort by pin status first, then by creation time
    # For category-specific requests, show category-pinned notes first
    # For general requests, show globally-pinned notes first
    if category:
        # Category page: category-pinned first, then globally-pinned, then normal notes
        notes = (
            notes_query.order_by(
                models.Note.pinned_category.desc(),
                models.Note.pinned_global.desc(), 
                models.Note.pinned_at.desc(),
                models.Note.created_at.desc()
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
    else:
        # Home/general page: globally-pinned first, then normal notes
        notes = (
            notes_query.order_by(
                models.Note.pinned_global.desc(),
                models.Note.pinned_at.desc(),
                models.Note.created_at.desc()
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
    # Use func.count() with specific column for better performance
    total = query.with_entities(func.count(models.Note.id)).scalar()
    key = (
        crypto.derive_key(current_user.password_hash, current_user.salt)
        if include_content
        else b""
    )
    items = [_note_to_schema(note, key, include_content=include_content) for note in notes]
    return schemas.NoteListOut(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/notes/timeline", response_model=schemas.TimelineOut)
def notes_timeline(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    group: str = Query(default="month"),
    category: Optional[str] = None,
    tag: Optional[str] = None,
    time_start: Optional[str] = None,
    time_end: Optional[str] = None,
    include_completed: bool = Query(default=False),
):
    group_clean = str(group or "").strip().lower()
    if group_clean not in ("month", "day"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid group")

    base_filters = [models.Note.user_id == current_user.id]
    if not include_completed:
        base_filters.append(or_(models.Note.completed.is_(None), models.Note.completed.is_(False)))
    if category:
        base_filters.append(models.Note.ai_category == category)
    if tag:
        cleaned_tag = str(tag or "").strip()
        if cleaned_tag:
            base_filters.append(
                models.Note.ai_tags.ilike(_tag_like_pattern(cleaned_tag), escape="\\")
            )
    
    query = db.query(models.Note).filter(*base_filters)
    query = _apply_time_filter(query, time_start, time_end)

    if group_clean == "day":
        key_expr = func.strftime("%Y-%m-%d", models.Note.created_at)
    else:
        key_expr = func.strftime("%Y-%m", models.Note.created_at)

    rows = (
        query.with_entities(key_expr.label("key"), func.count(models.Note.id).label("count"))
        .group_by("key")
        .order_by(text("key DESC"))
        .all()
    )
    items = [schemas.TimelineBucket(key=row[0] or "", count=int(row[1] or 0)) for row in rows if row[0]]
    return schemas.TimelineOut(group=group_clean, items=items)


@app.get("/api/notes/random", response_model=schemas.NoteOut)
def random_note(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    include_completed: bool = Query(default=False),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id)
        .filter(
            text("1=1")
            if include_completed
            else or_(models.Note.completed.is_(None), models.Note.completed.is_(False))
        )
        .order_by(func.random())
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No notes available")
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    return _note_to_schema(note, key)


@app.get("/api/notes/{note_id}", response_model=schemas.NoteOut)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.id == note_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    return _note_to_schema(note, key)


@app.post("/api/attachments", response_model=schemas.AttachmentOut)
def upload_attachment(
    note_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not file or not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file")
    note = None
    if note_id is not None:
        note = (
            db.query(models.Note)
            .filter(models.Note.id == note_id, models.Note.user_id == current_user.id)
            .first()
        )
        if not note:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    safe_name = _sanitize_filename(file.filename)
    _, ext = os.path.splitext(safe_name)
    if len(ext) > 10:
        ext = ext[:10]
    token = secrets.token_urlsafe(16)
    stored_name = f"{token}{ext}"

    user_dir = os.path.join(UPLOAD_DIR, f"user_{current_user.id}")
    os.makedirs(user_dir, exist_ok=True)
    stored_path = os.path.join(user_dir, stored_name)
    try:
        with open(stored_path, "wb") as target:
            shutil.copyfileobj(file.file, target)
    finally:
        file.file.close()
    size = os.path.getsize(stored_path) if os.path.exists(stored_path) else 0
    max_size = MAX_UPLOAD_MB * 1024 * 1024
    if max_size > 0 and size > max_size:
        try:
            os.remove(stored_path)
        except OSError:
            pass
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    attachment = models.Attachment(
        user_id=current_user.id,
        note_id=note.id if note else None,
        filename=safe_name,
        stored_name=stored_name,
        mime_type=file.content_type,
        size=size,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    if note is not None:
        db.add(models.NoteAttachment(note_id=note.id, attachment_id=attachment.id))
        db.commit()
    note_ids = {
        row[0]
        for row in (
            db.query(models.NoteAttachment.note_id)
            .filter(models.NoteAttachment.attachment_id == attachment.id)
            .all()
        )
        if row and row[0]
    }
    if attachment.note_id:
        note_ids.add(attachment.note_id)
    return schemas.AttachmentOut(
        id=attachment.id,
        note_id=attachment.note_id,
        note_ids=sorted(note_ids),
        filename=attachment.filename,
        mime_type=attachment.mime_type,
        size=attachment.size,
        url=_build_attachment_url(attachment.id),
        created_at=attachment.created_at,
    )


@app.get("/api/attachments", response_model=schemas.AttachmentListOut)
def list_attachments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    note_id: Optional[int] = None,
):
    query = db.query(models.Attachment).filter(models.Attachment.user_id == current_user.id)
    if note_id is not None:
        query = (
            query.outerjoin(
                models.NoteAttachment,
                models.NoteAttachment.attachment_id == models.Attachment.id,
            )
            .filter(
                or_(
                    models.Attachment.note_id == note_id,
                    models.NoteAttachment.note_id == note_id,
                )
            )
            .distinct()
        )
    total = query.count()
    attachments = (
        query.order_by(models.Attachment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    attachment_ids = [attachment.id for attachment in attachments]
    note_ids_map: Dict[int, set] = {}
    if attachment_ids:
        rows = (
            db.query(models.NoteAttachment.attachment_id, models.NoteAttachment.note_id)
            .filter(models.NoteAttachment.attachment_id.in_(attachment_ids))
            .all()
        )
        for attachment_id_value, note_id_value in rows:
            if not attachment_id_value or not note_id_value:
                continue
            note_ids_map.setdefault(int(attachment_id_value), set()).add(int(note_id_value))
    for attachment in attachments:
        if attachment.note_id:
            note_ids_map.setdefault(int(attachment.id), set()).add(int(attachment.note_id))

    items = [
        schemas.AttachmentOut(
            id=attachment.id,
            note_id=attachment.note_id,
            note_ids=sorted(note_ids_map.get(int(attachment.id), set())),
            filename=attachment.filename,
            mime_type=attachment.mime_type,
            size=attachment.size,
            url=_build_attachment_url(attachment.id),
            created_at=attachment.created_at,
        )
        for attachment in attachments
    ]
    return schemas.AttachmentListOut(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/attachments/{attachment_id}")
def get_attachment(
    attachment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    share_token: Optional[str] = None,
):
    attachment = (
        db.query(models.Attachment)
        .filter(models.Attachment.id == attachment_id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    user = _get_user_from_request(request, db)
    if user:
        if attachment.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    else:
        if not share_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
        share = (
            db.query(models.Share)
            .filter(models.Share.share_token == share_token)
            .first()
        )
        if not share:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
        if share.expires_at and ensure_beijing_tz(share.expires_at) < now_beijing():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share expired")
        if not attachment.note_id or attachment.note_id != share.note_id:
            linked = (
                db.query(models.NoteAttachment)
                .filter(
                    models.NoteAttachment.note_id == share.note_id,
                    models.NoteAttachment.attachment_id == attachment.id,
                )
                .first()
            )
            if not linked:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    file_path = os.path.join(UPLOAD_DIR, f"user_{attachment.user_id}", attachment.stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")
    return FileResponse(
        file_path,
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.filename,
    )


@app.delete("/api/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = (
        db.query(models.Attachment)
        .filter(models.Attachment.id == attachment_id, models.Attachment.user_id == current_user.id)
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    (
        db.query(models.NoteAttachment)
        .filter(models.NoteAttachment.attachment_id == attachment.id)
        .delete(synchronize_session=False)
    )
    file_path = os.path.join(UPLOAD_DIR, f"user_{attachment.user_id}", attachment.stored_name)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            logger.warning("Failed to remove attachment file: %s", file_path)
    db.delete(attachment)
    db.commit()
    return None


@app.get("/api/notes/{note_id}/related", response_model=schemas.RelatedNotesOut)
def related_notes(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    limit: int = Query(default=RELATED_DEFAULT_LIMIT, ge=1, le=20),
    include_completed: bool = Query(default=False),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.id == note_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    use_ai = _is_ai_enabled_for_user(current_user)
    query_embedding = _parse_embedding(note.embedding) if use_ai else None
    notes_query = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id, models.Note.id != note_id)
        .filter(
            text("1=1")
            if include_completed
            else or_(models.Note.completed.is_(None), models.Note.completed.is_(False))
        )
        .order_by(models.Note.created_at.desc())
    )
    if not query_embedding:
        notes_query = notes_query.options(defer(models.Note.embedding))
    notes = notes_query.all()
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    items, total, mode = _related_notes(note, notes, key, query_embedding, limit)
    return schemas.RelatedNotesOut(items=items, total=total, mode=mode)


@app.put("/api/notes/{note_id}", response_model=schemas.NoteOut)
def update_note(
    note_id: int,
    payload: schemas.NoteUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.id == note_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    if payload.content is None:
        if (
            payload.completed is None
            and payload.pinned_global is None
            and payload.pinned_category is None
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing content")
        if payload.completed is not None:
            note.completed = bool(payload.completed)
        if payload.pinned_global is not None:
            note.pinned_global = bool(payload.pinned_global)
            note.pinned_at = now_beijing() if payload.pinned_global else None
        if payload.pinned_category is not None:
            note.pinned_category = bool(payload.pinned_category)
            if payload.pinned_global is None:
                note.pinned_at = now_beijing() if payload.pinned_category else None
        note.updated_at = now_beijing()
        db.commit()
        db.refresh(note)
        key = crypto.derive_key(current_user.password_hash, current_user.salt)
        return _note_to_schema(note, key)

    anonymized, mapping = ai.anonymize_sensitive_data(payload.content)
    allowed_categories = _get_allowed_category_keys(current_user)
    use_ai = _is_ai_enabled_for_user(current_user)
    analysis_anonymized = (
        ai.analyze_note(anonymized, categories=allowed_categories, use_ai=use_ai)
        if payload.reanalyze
        else {}
    )
    analysis = _restore_mapping_in_obj(analysis_anonymized, mapping)

    if payload.title is not None:
        note.title = _normalize_title(payload.title)
    elif not note.title and isinstance(analysis, dict):
        note.title = _generate_title(analysis, payload.content)

    short_title = _build_short_title(
        analysis if isinstance(analysis, dict) else None,
        payload.content,
        note.title,
        prefer_title=payload.title is not None,
    )
    if short_title:
        note.short_title = short_title

    if payload.reanalyze:
        analysis_category = str(analysis.get("category") or "").strip().lower()
        if analysis_category in allowed_categories:
            note.ai_category = analysis_category
        tags = _normalize_tags(analysis.get("tags") or _safe_json_loads(note.ai_tags, []))
        note.ai_tags = json.dumps(tags)
        summary = analysis.get("summary") or note.ai_summary
        note.ai_summary = str(summary) if summary is not None else note.ai_summary
        entities = analysis.get("entities") or _safe_json_loads(note.ai_entities, {})
        if not isinstance(entities, dict):
            entities = {}
        note.ai_entities = json.dumps(entities)
        note.ai_sensitivity = analysis.get("sensitivity") or note.ai_sensitivity
        embedding_source = _build_embedding_source(
            anonymized,
            analysis_anonymized.get("summary") if isinstance(analysis_anonymized, dict) else None,
            analysis_anonymized.get("tags") if isinstance(analysis_anonymized, dict) else None,
            analysis_anonymized.get("title") if isinstance(analysis_anonymized, dict) else None,
        )
        embedding = ai.get_embedding(embedding_source, already_anonymized=True, use_ai=use_ai)
        note.embedding = json.dumps(embedding) if embedding else note.embedding

    if payload.short_title is not None:
        note.short_title = _normalize_short_title(payload.short_title)

    if payload.category is not None:
        cat_key = str(payload.category).strip().lower()
        if cat_key in allowed_categories:
            note.ai_category = cat_key

    if payload.folder is not None:
        note.folder = str(payload.folder).strip() or None

    if payload.tags is not None:
        note.ai_tags = json.dumps(_normalize_tags(payload.tags))

    if payload.completed is not None:
        note.completed = bool(payload.completed)
    
    if payload.pinned_global is not None:
        note.pinned_global = bool(payload.pinned_global)
        note.pinned_at = now_beijing() if payload.pinned_global else None
    
    if payload.pinned_category is not None:
        note.pinned_category = bool(payload.pinned_category)
        if payload.pinned_global is None:  # Only update pinned_at if global wasn't also updated
            note.pinned_at = now_beijing() if payload.pinned_category else None

    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    note.content = crypto.encrypt_content(payload.content, key)
    note.content_encrypted = True
    note.updated_at = now_beijing()

    _sync_note_attachments(db, current_user, note, payload.content)

    db.commit()
    db.refresh(note)
    return _note_to_schema(note, key)


@app.delete("/api/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.id == note_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    
    linked_attachment_ids = [
        row[0]
        for row in (
            db.query(models.NoteAttachment.attachment_id)
            .filter(models.NoteAttachment.note_id == note.id)
            .all()
        )
    ]
    
    attachments_to_check = []
    
    attachments = db.query(models.Attachment).filter(models.Attachment.note_id == note.id).all()
    for attachment in attachments:
        other_links_count = (
            db.query(models.NoteAttachment)
            .filter(
                models.NoteAttachment.attachment_id == attachment.id,
                models.NoteAttachment.note_id != note.id
            )
            .count()
        )
        if other_links_count > 0:
            attachment.note_id = None
        else:
            attachments_to_check.append(attachment)
    
    if linked_attachment_ids:
        attachments_linked_only = (
            db.query(models.Attachment)
            .filter(
                models.Attachment.user_id == current_user.id,
                models.Attachment.id.in_(linked_attachment_ids),
                models.Attachment.note_id.is_(None),
            )
            .all()
        )
        for attachment in attachments_linked_only:
            other_links_count = (
                db.query(models.NoteAttachment)
                .filter(
                    models.NoteAttachment.attachment_id == attachment.id,
                    models.NoteAttachment.note_id != note.id
                )
                .count()
            )
            if other_links_count == 0:
                attachments_to_check.append(attachment)
    
    (
        db.query(models.NoteAttachment)
        .filter(models.NoteAttachment.note_id == note.id)
        .delete(synchronize_session=False)
    )
    
    for attachment in attachments_to_check:
        file_path = os.path.join(UPLOAD_DIR, f"user_{attachment.user_id}", attachment.stored_name)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                logger.warning("Failed to remove attachment file: %s", file_path)
        db.delete(attachment)
    
    db.delete(note)
    db.commit()
    return None


@app.post("/api/notes/search", response_model=schemas.NoteListOut)
def search_notes(
    payload: schemas.SearchQuery,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Note).filter(models.Note.user_id == current_user.id)
    if not payload.include_completed:
        query = query.filter(or_(models.Note.completed.is_(None), models.Note.completed.is_(False)))
    use_ai = _is_ai_enabled_for_user(current_user)
    search_meta = ai.parse_search_query(payload.query, use_ai=use_ai)
    semantic_query = search_meta.get("semantic_query") or payload.query
    keywords = search_meta.get("keywords") or [semantic_query]
    query = _apply_time_filter(query, search_meta.get("time_start"), search_meta.get("time_end"))
    notes = query.order_by(models.Note.created_at.desc()).all()
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    items, total = _semantic_search_notes(
        notes,
        semantic_query,
        keywords,
        key,
        payload.limit,
        0,
        use_ai=use_ai,
    )
    return schemas.NoteListOut(items=items, total=total, page=1, page_size=payload.limit)


@app.post("/api/notes/rebuild-embeddings", response_model=schemas.RebuildEmbeddingsResponse)
def rebuild_embeddings(
    payload: schemas.RebuildEmbeddingsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    use_ai = _is_ai_enabled_for_user(current_user)
    if not use_ai:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI is disabled; embeddings are unavailable.",
        )
    base_query = db.query(models.Note).filter(models.Note.user_id == current_user.id)
    total = base_query.count()
    query = base_query.order_by(models.Note.id.desc())
    if payload.cursor:
        query = query.filter(models.Note.id < payload.cursor)
    if payload.batch_size:
        query = query.limit(payload.batch_size)
    notes = query.all()
    allowed_categories = _get_allowed_category_keys(current_user)
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    updated = 0
    failed = 0
    failures: List[int] = []
    for note in notes:
        try:
            content = crypto.decrypt_content(note.content, key) if note.content_encrypted else note.content
            anonymized_content, mapping = ai.anonymize_sensitive_data(content)
            analysis_anonymized: Any = {}
            analysis: Dict[str, Any] = {}
            if payload.reanalyze:
                analysis_anonymized = ai.analyze_note(
                    anonymized_content,
                    categories=allowed_categories,
                    use_ai=use_ai,
                )
                analysis = _restore_mapping_in_obj(analysis_anonymized, mapping)
                if not isinstance(analysis, dict):
                    analysis = {}
                analysis_category = str(analysis.get("category") or "").strip().lower()
                if analysis_category in allowed_categories:
                    note.ai_category = analysis_category
                tags = _normalize_tags(analysis.get("tags") or _safe_json_loads(note.ai_tags, []))
                note.ai_tags = json.dumps(tags)
                summary = analysis.get("summary") or note.ai_summary
                note.ai_summary = str(summary) if summary is not None else note.ai_summary
                entities = analysis.get("entities") or _safe_json_loads(note.ai_entities, {})
                if not isinstance(entities, dict):
                    entities = {}
                note.ai_entities = json.dumps(entities)
                note.ai_sensitivity = analysis.get("sensitivity") or note.ai_sensitivity
            short_title = _build_short_title(
                analysis if payload.reanalyze else None,
                content,
                note.title,
                prefer_title=not payload.reanalyze,
            )
            if short_title and (payload.reanalyze or not note.short_title):
                note.short_title = short_title
            summary_source = None
            tags_source: Any = None
            title_source: Optional[str] = None
            if isinstance(analysis_anonymized, dict) and analysis_anonymized:
                summary_source = analysis_anonymized.get("summary")
                tags_source = analysis_anonymized.get("tags")
                title_source = analysis_anonymized.get("title")
            if summary_source is None:
                summary_source = _anonymize_text(note.ai_summary)
            if tags_source is None:
                tags_source = [
                    _anonymize_text(tag)
                    for tag in _normalize_tags(_safe_json_loads(note.ai_tags, []))
                ]
            if title_source is None:
                title_source = _anonymize_text(note.title)
            embedding_source = _build_embedding_source(
                anonymized_content, summary_source, tags_source, title_source
            )
            embedding = ai.get_embedding(embedding_source, already_anonymized=True, use_ai=use_ai)
            if not embedding:
                failed += 1
                failures.append(note.id)
                continue
            note.embedding = json.dumps(embedding)
            updated += 1
        except Exception:
            logger.exception("Rebuild embeddings failed for note_id=%s", note.id)
            failed += 1
            failures.append(note.id)
    db.commit()
    next_cursor = None
    if payload.batch_size and notes and len(notes) == payload.batch_size:
        next_cursor = notes[-1].id
    return schemas.RebuildEmbeddingsResponse(
        total=total,
        updated=updated,
        failed=failed,
        failures=failures,
        next_cursor=next_cursor,
    )


@app.post("/api/shares", response_model=schemas.ShareOut)
def create_share(
    payload: schemas.ShareCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.id == payload.note_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    token = secrets.token_urlsafe(16)
    expires_at = None
    if payload.expires_in_days:
        expires_at = now_beijing() + timedelta(days=payload.expires_in_days)
    share = models.Share(note_id=note.id, share_token=token, expires_at=expires_at)
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@app.get("/api/shares/{token}", response_model=schemas.ShareView)
def get_share(token: str, db: Session = Depends(get_db)):
    share = db.query(models.Share).filter(models.Share.share_token == token).first()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    if share.expires_at and ensure_beijing_tz(share.expires_at) < now_beijing():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share expired")
    share.view_count += 1
    db.commit()
    user = share.note.user
    key = crypto.derive_key(user.password_hash, user.salt)
    note_out = _note_to_schema(share.note, key)
    return schemas.ShareView(note=note_out, expires_at=share.expires_at, view_count=share.view_count)


@app.delete("/api/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_share(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    share = (
        db.query(models.Share)
        .join(models.Note)
        .filter(models.Share.id == share_id, models.Note.user_id == current_user.id)
        .first()
    )
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    db.delete(share)
    db.commit()
    return None


@app.post("/api/ai/ask", response_model=schemas.AIAskResponse)
def ai_ask(
    payload: schemas.AIAskRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    use_ai = _is_ai_enabled_for_user(current_user)
    # Allow non-AI fallback
    
    query = payload.query.lower()
    notes = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id)
        .order_by(models.Note.created_at.desc())
        .limit(50)
        .all()
    )
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    matching: List[schemas.NoteOut] = []
    for note in notes:
        summary = note.ai_summary or ""
        tags = note.ai_tags or ""
        if query in summary.lower() or query in tags.lower():
            matching.append(_note_to_schema(note, key))
    answer = ai.answer_question(payload.query, [note.content for note in matching], use_ai=use_ai)
    return schemas.AIAskResponse(answer=answer, matches=matching[:5])


@app.post("/api/ai/summarize", response_model=schemas.AISummaryResponse)
def ai_summarize(
    payload: schemas.AISummaryRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    use_ai = _is_ai_enabled_for_user(current_user)
    # Allow non-AI fallback

    cutoff = now_beijing() - timedelta(days=payload.days)
    notes = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id, models.Note.created_at >= cutoff)
        .order_by(models.Note.created_at.desc())
        .all()
    )
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    contents = [crypto.decrypt_content(note.content, key) for note in notes]
    summary = ai.summarize_notes(contents, payload.days, use_ai=use_ai)
    return schemas.AISummaryResponse(summary=summary)


# Serve static files (Frontend)
def _mount_frontend():
    if getattr(sys, "frozen", False):
        # PyInstaller: frontend/dist is bundled in _MEIPASS
        static_dir = os.path.join(sys._MEIPASS, "frontend", "dist")
    else:
        # Development: ../frontend/dist
        static_dir = os.path.join(BASE_DIR, "..", "frontend", "dist")

    if not os.path.exists(static_dir):
        logger.warning("Frontend static directory not found at: %s", static_dir)
        return

    # Mount /assets specifically for efficiency
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Root route to serve index.html
    @app.get("/")
    async def serve_root():
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return Response("Frontend not found. Please ensure frontend/dist is built.", status_code=404)

    # Catch-all route for SPA
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Skip API routes (handled above)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)

        # Try to serve file directly (favicon.ico, etc.)
        file_path = os.path.join(static_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Fallback to index.html
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Frontend not found")

_mount_frontend()
