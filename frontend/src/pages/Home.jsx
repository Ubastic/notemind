import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";

const formatDate = (iso) => {
  if (!iso) return "";
  return iso.slice(0, 10);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Home() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [activeDate, setActiveDate] = useState("");
  const navigate = useNavigate();
  const captureRef = useRef(null);
  const searchRef = useRef(null);
  const sectionRefs = useRef({});

  const grouped = useMemo(() => {
    return notes.reduce((acc, note) => {
      const date = formatDate(note.created_at);
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(note);
      return acc;
    }, {});
  }, [notes]);

  const dates = useMemo(() => Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1)), [grouped]);
  const timelineItems = useMemo(
    () =>
      dates.map((date) => {
        const [year, month, day] = date.split("-");
        return {
          date,
          year,
          month: MONTHS[Math.max(0, Number.parseInt(month, 10) - 1)],
          day,
          count: grouped[date]?.length || 0,
        };
      }),
    [dates, grouped]
  );

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/notes?page=1&page_size=50&include_content=true");
      setNotes(data.items);
    } catch (err) {
      setError(err.message || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

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

  useEffect(() => {
    if (!dates.length) return;
    setActiveDate((prev) => prev || dates[0]);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (!visible.length) return;
        visible.sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top)
        );
        const next = visible[0].target.dataset.date;
        if (next) {
          setActiveDate(next);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.4, 0.7] }
    );
    dates.forEach((date) => {
      const el = sectionRefs.current[date];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [dates]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const trimmedTitle = title.trim();
      const note = await apiFetch("/notes", {
        method: "POST",
        body: { content, title: trimmedTitle || undefined },
      });
      setNotes((prev) => [note, ...prev]);
      setTitle("");
      setContent("");
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
    if (!search.trim()) return;
    navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  const handleJump = (date) => {
    const target = sectionRefs.current[date];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
          <div className="page-title">Timeline</div>
          <div className="page-subtitle">Capture fast, AI organizes the rest.</div>
        </div>
        <div className="btn-row">
          <span className="shortcut">Ctrl + K</span>
          <span className="shortcut">Ctrl + F</span>
        </div>
      </div>
      <div className="timeline-layout">
        <div className="timeline-main">
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
            placeholder="Drop anything here..."
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
                    placeholder="Search notes"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                <button className="btn btn-outline" type="submit">
                  Search
                </button>
              </form>
            </div>
        </div>
      </div>

          {error ? <div className="error">{error}</div> : null}

          {loading ? (
            <div className="empty-state">Loading notes...</div>
          ) : dates.length === 0 ? (
            <div className="empty-state">No notes yet. Add the first one above.</div>
          ) : (
            dates.map((date) => (
              <div
                className="section timeline-section"
                key={date}
                data-date={date}
                ref={(node) => {
                  if (node) sectionRefs.current[date] = node;
                }}
              >
                <div className="section-title">{date}</div>
                <div className="note-grid">
                  {grouped[date].map((note, index) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      index={index}
                      previewMode="timeline"
                      onDelete={() => handleDelete(note.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <aside className="timeline-rail" aria-label="Timeline">
          {timelineItems.length === 0 ? (
            <div className="timeline-empty">No dates yet</div>
          ) : (
            <div className="timeline-list">
              {timelineItems.map((item) => (
                <button
                  key={item.date}
                  className={`timeline-item ${activeDate === item.date ? "active" : ""}`}
                  type="button"
                  onClick={() => handleJump(item.date)}
                >
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="timeline-date">
                    <span className="timeline-day">{item.day}</span>
                    <span className="timeline-month">{item.month}</span>
                  </span>
                  <span className="timeline-year">{item.year}</span>
                  <span className="timeline-count">{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
