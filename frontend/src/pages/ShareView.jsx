import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch } from "../api";
import LanguageToggle from "../components/LanguageToggle";
import MarkdownContent from "../components/MarkdownContent";
import { useLanguage } from "../context/LanguageContext";

export default function ShareView() {
  const { token } = useParams();
  const { t, formatCategoryLabel } = useLanguage();
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
        setError(err.message || t("errors.loadShare"));
      } finally {
        setLoading(false);
      }
    };
    loadShare();
  }, [token]);

  const title = note?.title || note?.ai_summary || t("share.sharedNote");

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-toolbar">
          <LanguageToggle />
        </div>
        <h1>{title}</h1>
        <p className="muted">{t("share.readOnly")}</p>
        {error ? <div className="error">{error}</div> : null}
        {loading ? (
          <div className="empty-state">{t("common.loading")}</div>
        ) : note ? (
          <div className="section">
            <div className="badge">
              {formatCategoryLabel(note.ai_category || "idea", note.category_label || note.categoryLabel)}
            </div>
            <MarkdownContent content={note.content} attachmentToken={token} />
            <div className="tag-row">
              {(note.ai_tags || []).map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">{t("note.notFound")}</div>
        )}
      </div>
    </div>
  );
}
