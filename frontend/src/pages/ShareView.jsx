import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch } from "../api";

export default function ShareView() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadShare = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch(`/shares/${token}`, { skipAuth: true });
        setNote(data.note);
      } catch (err) {
        setError(err.message || "Failed to load share");
      } finally {
        setLoading(false);
      }
    };
    loadShare();
  }, [token]);

  const title = note?.title || note?.ai_summary || "Shared note";

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h1>{title}</h1>
        <p className="muted">Read-only view.</p>
        {error ? <div className="error">{error}</div> : null}
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : note ? (
          <div className="section">
            <div className="badge">{note.ai_category}</div>
            <div className="note-content">{note.content}</div>
            <div className="tag-row">
              {(note.ai_tags || []).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">Note not found.</div>
        )}
      </div>
    </div>
  );
}
