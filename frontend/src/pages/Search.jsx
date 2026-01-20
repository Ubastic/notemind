import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";

export default function Search() {
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
          body: { query, limit: 50 },
        });
        setNotes(data.items);
      } catch (err) {
        setError(err.message || "Search failed");
      } finally {
        setLoading(false);
      }
    };
    loadNotes();
  }, [query]);

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Search</div>
          <div className="page-subtitle">Results for "{query}"</div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Searching...</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">No results found.</div>
      ) : (
        <div className="note-grid">
          {notes.map((note, index) => (
            <NoteCard
              key={note.id}
              note={note}
              index={index}
              onDelete={() => handleDelete(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
