import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { deleteAttachment, listAttachments } from "../api";
import { useLanguage } from "../context/LanguageContext";

const PAGE_SIZE = 24;

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "--";
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const resolveAttachmentUrl = (url) => {
  if (!url) return "";
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch (err) {
    return url;
  }
};

const copyText = async (text) => {
  if (!text) return;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) {
    throw new Error("Copy failed");
  }
};

const isImage = (attachment) => (attachment?.mime_type || "").startsWith("image/");

const getFileLabel = (attachment) => {
  const mime = attachment?.mime_type || "";
  if (mime.includes("/")) {
    return mime.split("/")[1].toUpperCase();
  }
  const name = attachment?.filename || "";
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (ext) return ext.toUpperCase();
  return "FILE";
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const buildLinkedNotes = (attachment) => {
  const ids = [];
  const fromList = Array.isArray(attachment?.note_ids) ? attachment.note_ids : [];
  for (const value of fromList) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) continue;
    if (!ids.includes(parsed)) ids.push(parsed);
  }
  const legacy = Number(attachment?.note_id);
  if (Number.isInteger(legacy) && legacy > 0 && !ids.includes(legacy)) {
    ids.push(legacy);
  }
  return ids;
};

export default function Attachments() {
  const { t } = useLanguage();
  const [attachments, setAttachments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [noteIdInput, setNoteIdInput] = useState("");
  const [noteIdFilter, setNoteIdFilter] = useState(null);
  const [noteIdError, setNoteIdError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const loadAttachments = async (nextPage = 1, { append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const data = await listAttachments({
        page: nextPage,
        pageSize: PAGE_SIZE,
        noteId: noteIdFilter || undefined,
      });
      const items = Array.isArray(data.items) ? data.items : [];
      setAttachments((prev) => (append ? [...prev, ...items] : items));
      setTotal(Number.isFinite(data.total) ? data.total : items.length);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || t("errors.loadNotes"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadAttachments(1, { append: false });
  }, [noteIdFilter]);

  useEffect(() => {
    setNoteIdInput(noteIdFilter ? String(noteIdFilter) : "");
  }, [noteIdFilter]);

  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const applyNoteFilter = () => {
    setNoteIdError("");
    const trimmed = noteIdInput.trim();
    if (!trimmed) {
      setNoteIdFilter(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setNoteIdError(t("attachments.noteIdInvalid"));
      return;
    }
    setNoteIdFilter(parsed);
  };

  const clearNoteFilter = () => {
    setNoteIdError("");
    setNoteIdFilter(null);
  };

  const handleDelete = async (attachment) => {
    if (!attachment || deletingId) return;
    const confirmed = window.confirm(
      t("attachments.deleteConfirm", { name: attachment.filename || "" })
    );
    if (!confirmed) return;
    setDeletingId(attachment.id);
    setError("");
    try {
      await deleteAttachment(attachment.id);
      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = async (url) => {
    setError("");
    try {
      await copyText(resolveAttachmentUrl(url));
    } catch (err) {
      setError(err.message || t("errors.copyFailed"));
    }
  };

  const handleLoadMore = () => {
    if (loadingMore || loading) return;
    if (attachments.length >= total) return;
    loadAttachments(page + 1, { append: true });
  };

  const handleOpenPreview = (attachment) => {
    if (!isImage(attachment)) return;
    const url = resolveAttachmentUrl(attachment.url);
    if (!url) return;
    setPreviewImage({ url, filename: attachment.filename || "" });
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredAttachments = useMemo(() => {
    return attachments.filter((attachment) => {
      const image = isImage(attachment);
      if (typeFilter === "images" && !image) return false;
      if (typeFilter === "files" && image) return false;
      if (normalizedSearch) {
        const name = String(attachment.filename || "").toLowerCase();
        if (!name.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [attachments, normalizedSearch, typeFilter]);

  const hasMore = attachments.length < total;
  const hasFilter =
    normalizedSearch || typeFilter !== "all" || (noteIdFilter !== null && noteIdFilter !== undefined);
  const countValue = normalizedSearch || typeFilter !== "all" ? filteredAttachments.length : total;
  const subtitle = noteIdFilter
    ? t("attachments.subtitleFiltered", { noteId: noteIdFilter })
    : t("attachments.subtitle");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("attachments.title")}</div>
          <div className="page-subtitle">{subtitle}</div>
        </div>
        <div className="badge">{t("attachments.count", { count: countValue })}</div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card attachments-toolbar">
        <div className="attachments-controls">
          <div className="toggle-block">
            <div className="toggle-label">{t("attachments.typeLabel")}</div>
            <div className="toggle-group">
              {[
                { key: "all", label: t("attachments.typeAll") },
                { key: "images", label: t("attachments.typeImages") },
                { key: "files", label: t("attachments.typeFiles") },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`toggle-btn ${typeFilter === option.key ? "active" : ""}`}
                  onClick={() => setTypeFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="toggle-block">
            <div className="toggle-label">{t("attachments.noteFilter")}</div>
            <div className="input-row">
              <input
                type="text"
                value={noteIdInput}
                onChange={(event) => setNoteIdInput(event.target.value)}
                placeholder={t("attachments.noteIdPlaceholder")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyNoteFilter();
                  }
                }}
              />
              <button className="btn btn-outline" type="button" onClick={applyNoteFilter}>
                {t("attachments.applyFilter")}
              </button>
              {noteIdFilter ? (
                <button className="btn btn-ghost" type="button" onClick={clearNoteFilter}>
                  {t("common.clear")}
                </button>
              ) : null}
            </div>
            {noteIdError ? <div className="error">{noteIdError}</div> : null}
          </div>

          <div className="toggle-block attachments-search">
            <div className="toggle-label">{t("common.search")}</div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("attachments.searchPlaceholder")}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">{t("attachments.loading")}</div>
      ) : filteredAttachments.length === 0 ? (
        <div className="empty-state">
          {hasFilter ? t("attachments.emptyFiltered") : t("attachments.empty")}
        </div>
      ) : (
        <>
          <div className="attachment-grid">
            {filteredAttachments.map((attachment, index) => {
              const image = isImage(attachment);
              const url = resolveAttachmentUrl(attachment.url);
              const fileLabel = getFileLabel(attachment);
              return (
                <div
                  key={attachment.id}
                  className="attachment-card"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="attachment-preview">
                    {image ? (
                      <button
                        className="attachment-image-btn"
                        type="button"
                        onClick={() => handleOpenPreview(attachment)}
                        aria-label={attachment.filename || ""}
                      >
                        <img src={url} alt={attachment.filename || ""} loading="lazy" />
                      </button>
                    ) : (
                      <div className="attachment-icon">{fileLabel}</div>
                    )}
                  </div>
                  <div className="attachment-meta">
                    <span className="badge">{fileLabel}</span>
                    <span>{formatBytes(attachment.size)}</span>
                    <span>{formatDate(attachment.created_at)}</span>
                  </div>
                  <h3 className="attachment-title">{attachment.filename}</h3>
                  <div className="attachment-note">
                    {buildLinkedNotes(attachment).length ? (
                      <div className="attachment-note-links">
                        {buildLinkedNotes(attachment).map((noteId) => (
                          <Link key={noteId} to={`/note/${noteId}`}>
                            {t("attachments.openNote")} #{noteId}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span>{t("attachments.unlinked")}</span>
                    )}
                  </div>
                  <div className="attachment-footer">
                    <div className="attachment-links">
                      <a
                        className="btn btn-outline"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        {t("attachments.download")}
                      </a>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => handleCopyLink(url)}
                      >
                        {t("attachments.copyLink")}
                      </button>
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => handleDelete(attachment)}
                      disabled={deletingId === attachment.id}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore ? (
            <div className="tag-load-more">
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t("common.loading") : t("tags.loadMore")}
              </button>
            </div>
          ) : null}
        </>
      )}

      {previewImage ? (
        <div className="image-modal" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <div className="image-modal-content" onClick={(event) => event.stopPropagation()}>
            <button
              className="image-modal-close"
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label="Close"
            >
              ×
            </button>
            <img className="image-modal-img" src={previewImage.url} alt={previewImage.filename} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
