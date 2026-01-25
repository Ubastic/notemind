import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Search() {
  const { t } = useLanguage();
  const settings = useSettings();
  const showCompleted = settings?.showCompleted ?? false;
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadNotes = async () => {
      if (!query) {
        setNotes([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/notes/search", {
          method: "POST",
          body: { query, limit: 50, include_completed: showCompleted },
        });
        setNotes(data.items);
      } catch (err) {
        setError(err.message || t("errors.searchFailed"));
      } finally {
        setLoading(false);
      }
    };
    loadNotes();
  }, [query, showCompleted]);

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    }
  };

  const handleToggleComplete = async (note) => {
    if (!note) return;
    setError("");
    try {
      const nextCompleted = !note.completed;
      const data = await apiFetch(`/notes/${note.id}`, {
        method: "PUT",
        body: {
          completed: nextCompleted,
          reanalyze: false,
        },
      });
      setNotes((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      );
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("search.title")}</div>
          <div className="page-subtitle">{t("search.results", { query })}</div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">{t("search.loading")}</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">{t("search.empty")}</div>
      ) : (
        <div className="note-grid">
          {notes.map((note, index) => (
            <NoteCard
              key={note.id}
              note={note}
              index={index}
              onDelete={() => handleDelete(note.id)}
              onToggleComplete={handleToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
