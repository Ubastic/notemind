import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Random() {
  const { t } = useLanguage();
  const settings = useSettings();
  const showCompleted = settings?.showCompleted ?? false;
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRandom = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        include_completed: showCompleted ? "true" : "false",
      });
      const data = await apiFetch(`/notes/random?${params.toString()}`);
      setNote(data);
    } catch (err) {
      setError(err.message || t("errors.loadNote"));
      setNote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRandom();
  }, [showCompleted]);

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNote(null);
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("random.title")}</div>
          <div className="page-subtitle">{t("random.subtitle")}</div>
        </div>
        <button className="btn btn-outline" type="button" onClick={loadRandom}>
          {t("common.shuffle")}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">{t("common.loading")}</div>
      ) : note ? (
        <div className="note-grid">
          <NoteCard note={note} index={0} onDelete={() => handleDelete(note.id)} />
        </div>
      ) : (
        <div className="empty-state">{t("common.noNotes")}</div>
      )}
    </div>
  );
}
