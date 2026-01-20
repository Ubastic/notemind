import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";
import TimeFolderTree from "../components/TimeFolderTree";
import { useSettings } from "../context/SettingsContext";

export default function Category() {
  const { type } = useParams();
  const settings = useSettings();
  const categoryLabel = settings?.categoryLabels?.[type] || type;
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("folders");
  const captureRef = useRef(null);
  const searchRef = useRef(null);

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: "1",
        page_size: "50",
        category: type,
        include_content: "false",
      });
      if (query) {
        params.set("q", query);
      }
      const data = await apiFetch(`/notes?${params.toString()}`);
      setNotes(data.items);
    } catch (err) {
      setError(err.message || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchInput("");
    setQuery("");
    setTitle("");
    setContent("");
  }, [type]);

  useEffect(() => {
    loadNotes();
  }, [type, query]);

  useEffect(() => {
    const handler = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        captureRef.current?.focus();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const trimmedTitle = title.trim();
      await apiFetch("/notes", {
        method: "POST",
        body: { content, category: type, title: trimmedTitle || undefined },
      });
      setTitle("");
      setContent("");
      await loadNotes();
    } catch (err) {
      setError(err.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  const handleCaptureKeyDown = (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      if (!saving) {
        handleSubmit();
      }
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setQuery("");
  };

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
          <div className="page-title">{categoryLabel}</div>
          <div className="page-subtitle">
            {query ? `Filtered by category and search: "${query}".` : "Filtered by category."}
          </div>
        </div>
        <div className="view-controls">
          <div className="toggle-block">
            <span className="toggle-label">View</span>
            <div className="toggle-group" role="group" aria-label="View">
              <button
                className={`toggle-btn ${viewMode === "folders" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("folders")}
              >
                Folders
              </button>
              <button
                className={`toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("cards")}
              >
                Cards
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card quick-capture">
        <div className="section">
          <div className="card-title">Quick capture</div>
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            ref={captureRef}
            placeholder={`Add a note in ${categoryLabel}...`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={handleCaptureKeyDown}
          />
          <div className="capture-actions">
            <button className="btn" type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save note"}
            </button>
          </div>
        </div>
        <div className="quick-actions">
          <div className="section">
            <div className="card-title">Search</div>
            <form onSubmit={handleSearch} className="section">
              <input
                ref={searchRef}
                type="text"
                placeholder={`Search ${categoryLabel} notes`}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <div className="btn-row">
                <button className="btn btn-outline" type="submit">
                  Search
                </button>
                <button className="btn btn-ghost" type="button" onClick={handleClearSearch}>
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          {query ? "No matching notes in this category." : "No notes in this category."}
        </div>
      ) : viewMode === "folders" ? (
        <TimeFolderTree notes={notes} />
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
