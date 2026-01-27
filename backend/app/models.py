from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")
    attachments = relationship(
        "Attachment", back_populates="user", cascade="all, delete-orphan"
    )
    settings = relationship(
        "UserSettings",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    payload = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="settings")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    content = Column(Text, nullable=False)
    content_encrypted = Column(Boolean, default=True)

    completed = Column(Boolean, default=False)

    title = Column(String)
    short_title = Column(String)
    ai_category = Column(String)
    ai_summary = Column(String)
    ai_tags = Column(Text)
    ai_entities = Column(Text)
    ai_sensitivity = Column(String)
    folder = Column(String)
    embedding = Column(Text)

    pinned_global = Column(Boolean, default=False)
    pinned_category = Column(Boolean, default=False)
    pinned_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="notes")
    shares = relationship("Share", back_populates="note", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="note")
    note_attachments = relationship(
        "NoteAttachment", back_populates="note", cascade="all, delete-orphan"
    )


class NoteAttachment(Base):
    __tablename__ = "note_attachments"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False, index=True)
    attachment_id = Column(Integer, ForeignKey("attachments.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "note_id",
            "attachment_id",
            name="uq_note_attachments_note_attachment",
        ),
    )

    note = relationship("Note", back_populates="note_attachments")
    attachment = relationship("Attachment", back_populates="note_attachments")


class Share(Base):
    __tablename__ = "shares"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    share_token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True))
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    note = relationship("Note", back_populates="shares")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    note_id = Column(Integer, ForeignKey("notes.id"))
    filename = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    mime_type = Column(String)
    size = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="attachments")
    note = relationship("Note", back_populates="attachments")
    note_attachments = relationship(
        "NoteAttachment", back_populates="attachment", cascade="all, delete-orphan"
    )
