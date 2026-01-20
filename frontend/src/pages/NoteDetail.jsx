import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../api";
import { useSettings } from "../context/SettingsContext";

const maskSensitive = (text) => {
  if (!text) return "";
  return text
    .replace(/(password|passwd|pwd|token|key|secret)\s*[:=]\s*\S+/gi, "$1: ******")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "xxx.xxx.xxx.xxx");
};

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mask, setMask] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNote = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/notes/${id}`);
      setNote(data);
      setTitle(data.title || "");
      setContent(data.content);
    } catch (err) {
      setError(err.message || "Failed to load note");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNote();
  }, [id]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const trimmedTitle = title.trim();
      const data = await apiFetch(`/notes/${id}`, {
        method: "PUT",
        body: { content, title: trimmedTitle || undefined, reanalyze: true },
      });
      setNote(data);
      setTitle(data.title || "");
      setEditing(false);
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;
    try {
      await apiFetch(`/notes/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const handleShare = async () => {
    setError("");
    try {
      const data = await apiFetch("/shares", {
        method: "POST",
        body: { note_id: Number(id), expires_in_days: 7 },
      });
      setShareLink(`${window.location.origin}/share/${data.share_token}`);
    } catch (err) {
      setError(err.message || "Share failed");
    }
  };

  const displayContent = useMemo(() => {
    if (!note) return "";
    return mask ? maskSensitive(note.content) : note.content;
  }, [note, mask]);

  const displaySummary = useMemo(() => {
    if (!note) return "";
    const summary = note.ai_summary || "";
    return mask ? maskSensitive(summary) : summary;
  }, [note, mask]);

  const displayShortTitle = useMemo(() => {
    if (!note) return "";
    const shortTitle = note.short_title || "";
    return mask ? maskSensitive(shortTitle) : shortTitle;
  }, [note, mask]);

  const categoryLabel = useMemo(() => {
    if (!note) return "";
    return settings?.categoryLabels?.[note.ai_category] || note.ai_category || "idea";
  }, [note, settings]);

  if (loading) {
    return <div className="empty-state">Loading note...</div>;
  }

  if (!note) {
    return <div className="empty-state">Note not found.</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Note detail</div>
          <div className="page-subtitle">
            {note.title || note.ai_summary || "Untitled note"}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={() => setMask(!mask)}>
            {mask ? "Reveal" : "Mask"}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleShare}>
            Share link
          </button>
          <button className="btn btn-outline" type="button" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {shareLink ? (
        <div className="card">
          <div className="card-title">Share link</div>
          <div className="input-row">
            <input value={shareLink} readOnly />
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareLink)}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <div className="card note-detail">
        <div className="section">
          <div className="summary-block">
            <div className="section-title">AI summary</div>
            <div className={displaySummary ? "note-summary" : "muted"}>
              {displaySummary || "Not generated."}
            </div>
          </div>
          {editing ? (
            <>
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea value={content} onChange={(event) => setContent(event.target.value)} />
              <div className="note-action-row">
                <button className="btn" type="button" onClick={handleUpdate} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="note-content">{displayContent}</div>
              <button className="btn btn-outline" type="button" onClick={() => setEditing(true)}>
                Edit note
              </button>
            </>
          )}
        </div>
        <div className="meta-grid">
          <div>
            <div className="meta-label">Category</div>
            <div>{categoryLabel}</div>
          </div>
          <div>
            <div className="meta-label">Short title</div>
            <div className={displayShortTitle ? "" : "muted"}>
              {displayShortTitle || "Not generated."}
            </div>
          </div>
          <div>
            <div className="meta-label">Sensitivity</div>
            <div>{note.ai_sensitivity || "low"}</div>
          </div>
          <div>
            <div className="meta-label">Created</div>
            <div>{note.created_at.slice(0, 19).replace("T", " ")}</div>
          </div>
          <div>
            <div className="meta-label">Tags</div>
            <div className="tag-row">
              {(note.ai_tags || []).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="meta-label">Entities</div>
            <pre className="muted">
              {JSON.stringify(note.ai_entities || {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
