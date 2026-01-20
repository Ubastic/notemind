import json
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from .time_utils import ensure_beijing_tz, now_beijing

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session, defer

from . import ai, crypto, models, schemas, security
from .database import SessionLocal, engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SEMANTIC_SIMILARITY_THRESHOLD = float(os.getenv("SEMANTIC_SIMILARITY_THRESHOLD", "0.2"))
SHORT_TITLE_MAX_LEN = int(os.getenv("SHORT_TITLE_MAX_LEN", "32"))
DEFAULT_CATEGORIES = [
    {"key": "credential", "label": "Credentials"},
    {"key": "work", "label": "Work"},
    {"key": "idea", "label": "Ideas"},
    {"key": "todo", "label": "Todo"},
]

models.Base.metadata.create_all(bind=engine)


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


_ensure_notes_indexes()

app = FastAPI(title="NoteMind API", version="0.1.0")

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

auth_scheme = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    token = credentials.credentials
    try:
        payload = security.decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _safe_json_loads(value: Optional[str], default: Any):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


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
    tags = _safe_json_loads(note.ai_tags, [])
    if not isinstance(tags, list):
        tags = []
    entities = _safe_json_loads(note.ai_entities, {})
    if not isinstance(entities, dict):
        entities = {}
    return schemas.NoteOut(
        id=note.id,
        title=note.title,
        short_title=note.short_title,
        content=content,
        ai_category=note.ai_category,
        ai_summary=note.ai_summary,
        ai_tags=tags,
        ai_entities=entities,
        ai_sensitivity=note.ai_sensitivity,
        search_info=search_info,
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


def _normalize_tags(tags: Any) -> List[str]:
    if isinstance(tags, list):
        return [str(tag) for tag in tags if str(tag).strip()]
    if isinstance(tags, str):
        cleaned = tags.strip()
        return [cleaned] if cleaned else []
    return []


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
    include_content: bool = True,
) -> Tuple[List[schemas.NoteOut], int]:
    keyword_list = keywords or [semantic_query]
    direct_query = (keyword_list[0] if keyword_list else semantic_query).strip()
    direct_query_lower = direct_query.lower()
    query_embedding = ai.get_embedding(semantic_query)
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
def login(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = security.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, token_type="bearer")


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/api/settings", response_model=schemas.UserSettings)
def get_settings(current_user: models.User = Depends(get_current_user)):
    return schemas.UserSettings(categories=_get_user_categories(current_user))


@app.put("/api/settings", response_model=schemas.UserSettings)
def update_settings(
    payload: schemas.UserSettings,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    categories = _normalize_categories(payload.categories)
    settings_payload = {"categories": categories} if categories else {}
    payload_json = json.dumps(settings_payload) if settings_payload else None
    if current_user.settings:
        current_user.settings.payload = payload_json
    else:
        current_user.settings = models.UserSettings(user_id=current_user.id, payload=payload_json)
        db.add(current_user.settings)
    db.commit()
    return schemas.UserSettings(categories=categories or DEFAULT_CATEGORIES)


@app.post("/api/notes", response_model=schemas.NoteOut)
def create_note(
    payload: schemas.NoteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    anonymized, mapping = ai.anonymize_sensitive_data(payload.content)
    allowed_categories = _get_allowed_category_keys(current_user)
    analysis_anonymized = ai.analyze_note(anonymized, categories=allowed_categories)
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
    category = _select_category(allowed_categories, payload.category, analysis.get("category"))
    tags = analysis.get("tags") or []
    if not isinstance(tags, list):
        tags = [str(tags)]
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
    embedding = ai.get_embedding(embedding_source, already_anonymized=True)
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
        ai_summary=summary,
        ai_tags=json.dumps(tags),
        ai_entities=json.dumps(entities),
        ai_sensitivity=sensitivity,
        embedding=embedding_json,
        created_at=now_beijing(),
        updated_at=now_beijing(),
    )
    db.add(note)
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
    tag: Optional[str] = None,
    q: Optional[str] = None,
    include_content: bool = Query(default=False),
):
    query = db.query(models.Note).filter(models.Note.user_id == current_user.id)
    if category:
        query = query.filter(models.Note.ai_category == category)
    if tag:
        query = query.filter(models.Note.ai_tags.ilike(f"%{tag}%"))
    if q:
        search_meta = ai.parse_search_query(q)
        semantic_query = search_meta.get("semantic_query") or q
        keywords = search_meta.get("keywords") or [semantic_query]
        query = _apply_time_filter(query, search_meta.get("time_start"), search_meta.get("time_end"))
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
            include_content=include_content,
        )
        return schemas.NoteListOut(items=items, total=total, page=page, page_size=page_size)
    total = query.count()
    notes_query = query.options(defer(models.Note.embedding))
    if not include_content:
        notes_query = notes_query.options(
            defer(models.Note.content),
            defer(models.Note.content_encrypted),
        )
    notes = (
        notes_query.order_by(models.Note.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    key = (
        crypto.derive_key(current_user.password_hash, current_user.salt)
        if include_content
        else b""
    )
    items = [_note_to_schema(note, key, include_content=include_content) for note in notes]
    return schemas.NoteListOut(items=items, total=total, page=page, page_size=page_size)


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

    anonymized, mapping = ai.anonymize_sensitive_data(payload.content)
    allowed_categories = _get_allowed_category_keys(current_user)
    analysis_anonymized = (
        ai.analyze_note(anonymized, categories=allowed_categories) if payload.reanalyze else {}
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
        tags = analysis.get("tags") or _safe_json_loads(note.ai_tags, [])
        if not isinstance(tags, list):
            tags = [str(tags)]
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
        embedding = ai.get_embedding(embedding_source, already_anonymized=True)
        note.embedding = json.dumps(embedding) if embedding else note.embedding

    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    note.content = crypto.encrypt_content(payload.content, key)
    note.content_encrypted = True
    note.updated_at = now_beijing()

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
    search_meta = ai.parse_search_query(payload.query)
    semantic_query = search_meta.get("semantic_query") or payload.query
    keywords = search_meta.get("keywords") or [semantic_query]
    query = _apply_time_filter(query, search_meta.get("time_start"), search_meta.get("time_end"))
    notes = query.order_by(models.Note.created_at.desc()).all()
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    items, total = _semantic_search_notes(notes, semantic_query, keywords, key, payload.limit, 0)
    return schemas.NoteListOut(items=items, total=total, page=1, page_size=payload.limit)


@app.post("/api/notes/rebuild-embeddings", response_model=schemas.RebuildEmbeddingsResponse)
def rebuild_embeddings(
    payload: schemas.RebuildEmbeddingsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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
                )
                analysis = _restore_mapping_in_obj(analysis_anonymized, mapping)
                if not isinstance(analysis, dict):
                    analysis = {}
                analysis_category = str(analysis.get("category") or "").strip().lower()
                if analysis_category in allowed_categories:
                    note.ai_category = analysis_category
                tags = analysis.get("tags") or _safe_json_loads(note.ai_tags, [])
                if not isinstance(tags, list):
                    tags = [str(tags)]
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
            embedding = ai.get_embedding(embedding_source, already_anonymized=True)
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


@app.get("/api/notes/random", response_model=schemas.NoteOut)
def random_note(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    note = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id)
        .order_by(func.random())
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No notes available")
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    return _note_to_schema(note, key)


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
    answer = ai.answer_question(payload.query, [note.content for note in matching])
    return schemas.AIAskResponse(answer=answer, matches=matching[:5])


@app.post("/api/ai/summarize", response_model=schemas.AISummaryResponse)
def ai_summarize(
    payload: schemas.AISummaryRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cutoff = now_beijing() - timedelta(days=payload.days)
    notes = (
        db.query(models.Note)
        .filter(models.Note.user_id == current_user.id, models.Note.created_at >= cutoff)
        .order_by(models.Note.created_at.desc())
        .all()
    )
    key = crypto.derive_key(current_user.password_hash, current_user.salt)
    contents = [crypto.decrypt_content(note.content, key) for note in notes]
    summary = ai.summarize_notes(contents, payload.days)
    return schemas.AISummaryResponse(summary=summary)
