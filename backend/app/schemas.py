from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        orm_mode = True


class CategoryConfig(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    label: Optional[str] = None


class UserSettings(BaseModel):
    categories: List[CategoryConfig] = Field(default_factory=list)
    ai_enabled: Optional[bool] = None


class Token(BaseModel):
    access_token: str
    token_type: str


class NoteCreate(BaseModel):
    content: str = Field(min_length=1)
    category: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=200)
    folder: Optional[str] = Field(default=None, max_length=200)


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    completed: Optional[bool] = None
    reanalyze: bool = True
    title: Optional[str] = Field(default=None, max_length=200)
    short_title: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = None
    folder: Optional[str] = Field(default=None, max_length=200)
    tags: Optional[List[str]] = None
    pinned_global: Optional[bool] = None
    pinned_category: Optional[bool] = None


class SearchInfo(BaseModel):
    match_type: str
    matched_keywords: List[str] = Field(default_factory=list)
    similarity: float = 0.0
    score: float = 0.0


class NoteOut(BaseModel):
    id: int
    title: Optional[str] = None
    short_title: Optional[str] = None
    content: str
    completed: bool = False
    ai_category: Optional[str] = None
    folder: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_tags: List[str] = Field(default_factory=list)
    ai_entities: Dict[str, Any] = Field(default_factory=dict)
    ai_sensitivity: Optional[str] = None
    search_info: Optional[SearchInfo] = None
    pinned_global: bool = False
    pinned_category: bool = False
    pinned_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class NoteListOut(BaseModel):
    items: List[NoteOut]
    total: int
    page: int
    page_size: int


class TimelineBucket(BaseModel):
    key: str
    count: int


class TimelineOut(BaseModel):
    group: str
    items: List[TimelineBucket]


class RelatedNotesOut(BaseModel):
    items: List[NoteOut]
    total: int
    mode: str


class ShareCreate(BaseModel):
    note_id: int
    expires_in_days: Optional[int] = None


class ShareOut(BaseModel):
    id: int
    note_id: int
    share_token: str
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        orm_mode = True


class ShareView(BaseModel):
    note: NoteOut
    expires_at: Optional[datetime] = None
    view_count: int


class AttachmentOut(BaseModel):
    id: int
    note_id: Optional[int] = None
    note_ids: List[int] = Field(default_factory=list)
    filename: str
    mime_type: Optional[str] = None
    size: Optional[int] = None
    url: str
    created_at: datetime

    class Config:
        orm_mode = True


class AttachmentListOut(BaseModel):
    items: List[AttachmentOut]
    total: int
    page: int
    page_size: int


class SearchQuery(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=10, ge=1, le=50)
    include_completed: bool = False


class RebuildEmbeddingsRequest(BaseModel):
    reanalyze: bool = False
    batch_size: int = Field(default=0, ge=0, le=500)
    cursor: Optional[int] = None


class RebuildEmbeddingsResponse(BaseModel):
    total: int
    updated: int
    failed: int
    failures: List[int] = Field(default_factory=list)
    next_cursor: Optional[int] = None


class AIAskRequest(BaseModel):
    query: str = Field(min_length=1)


class AIAskResponse(BaseModel):
    answer: str
    matches: List[NoteOut] = Field(default_factory=list)


class AISummaryRequest(BaseModel):
    days: int = Field(default=7, ge=1, le=30)


class AISummaryResponse(BaseModel):
    summary: str


class FolderSuggestion(BaseModel):
    name: str
    note_ids: List[int] = Field(default_factory=list)


class CategorySuggestion(BaseModel):
    name: str
    folders: List[FolderSuggestion] = Field(default_factory=list)


class AIOrganizeRequest(BaseModel):
    dry_run: bool = True


class AIOrganizeResponse(BaseModel):
    categories: List[CategorySuggestion] = Field(default_factory=list)
    uncategorized_note_ids: List[int] = Field(default_factory=list)


class AIOrganizeApplyRequest(BaseModel):
    categories: List[CategorySuggestion]
