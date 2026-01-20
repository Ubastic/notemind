import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";

export default function Random() {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRandom = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/notes/random");
      setNote(data);
    } catch (err) {
      setError(err.message || "Failed to load note");
      setNote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRandom();
  }, []);

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNote(null);
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Random</div>
          <div className="page-subtitle">A single note to spark ideas.</div>
        </div>
        <button className="btn btn-outline" type="button" onClick={loadRandom}>
          Shuffle
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : note ? (
        <div className="note-grid">
          <NoteCard note={note} index={0} onDelete={() => handleDelete(note.id)} />
        </div>
      ) : (
        <div className="empty-state">No notes yet.</div>
      )}
    </div>
  );
}
