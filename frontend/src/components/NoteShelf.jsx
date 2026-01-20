import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const truncate = (text, limit) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const getTitle = (note) => {
  const raw = note?.short_title || note?.title || note?.ai_summary || "Untitled note";
  const trimmed = String(raw || "").trim();
  return trimmed || "Untitled note";
};

const getShortTitle = (note, limit = 28) => truncate(getTitle(note), limit);

const getGroupKey = (note, groupBy) => {
  const iso = note?.created_at;
  if (!iso) return "unknown";
  return groupBy === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
};

const sortGroupKeys = (a, b) => {
  if (a === "unknown") return 1;
  if (b === "unknown") return -1;
  return a < b ? 1 : -1;
};

const buildGroupMeta = (key, groupBy) => {
  if (!key || key === "unknown") {
    return {
      label: "Unknown",
      year: "",
      monthLabel: "Unknown",
      day: "",
    };
  }
  const [year, month, day] = key.split("-");
  const monthIndex = Math.max(0, Number.parseInt(month, 10) - 1);
  const monthLabel = MONTHS[monthIndex] || month;
  if (groupBy === "month") {
    return {
      label: `${monthLabel} ${year}`,
      year,
      monthLabel,
      day: "",
    };
  }
  return {
    label: `${monthLabel} ${day}, ${year}`,
    year,
    monthLabel,
    day,
  };
};

const formatItemStamp = (iso, groupBy) => {
  if (!iso) return "";
  if (groupBy === "month") {
    return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
  }
  return iso.slice(11, 16);
};

export default function NoteShelf({ notes = [], groupBy = "month" }) {
  const safeNotes = Array.isArray(notes) ? notes : [];
  const [openKey, setOpenKey] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const sectionRefs = useRef({});

  const grouped = useMemo(() => {
    const acc = {};
    safeNotes.forEach((note) => {
      const key = getGroupKey(note, groupBy);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(note);
    });
    Object.values(acc).forEach((items) => {
      items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    });
    return acc;
  }, [safeNotes, groupBy]);

  const groupKeys = useMemo(() => Object.keys(grouped).sort(sortGroupKeys), [grouped]);

  const groups = useMemo(
    () =>
      groupKeys.map((key) => {
        const items = grouped[key] || [];
        return {
          key,
          notes: items,
          count: items.length,
          ...buildGroupMeta(key, groupBy),
        };
      }),
    [groupKeys, grouped, groupBy]
  );

  useEffect(() => {
    setOpenKey("");
  }, [groupBy]);

  useEffect(() => {
    if (!groupKeys.length) {
      setActiveKey("");
      return;
    }
    setActiveKey((prev) => (groupKeys.includes(prev) ? prev : groupKeys[0]));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (!visible.length) return;
        visible.sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top)
        );
        const next = visible[0].target.dataset.group;
        if (next) {
          setActiveKey(next);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.4, 0.7] }
    );
    groupKeys.forEach((key) => {
      const el = sectionRefs.current[key];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [groupKeys]);

  const handleJump = (key) => {
    const target = sectionRefs.current[key];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!groupKeys.length) {
    return <div className="empty-state">No notes yet.</div>;
  }

  return (
    <div className="timeline-layout">
      <div className="timeline-main">
        <div className="note-shelf-grid">
          {groups.map((group, index) => {
            const previewNotes = group.notes.slice(0, 4);
            const extraCount = group.count - previewNotes.length;
            const isOpen = openKey === group.key;
            const panelMax = Math.min(520, 120 + group.count * 28);
            return (
              <section
                key={group.key}
                className="note-shelf-group"
                data-group={group.key}
                data-open={isOpen ? "true" : "false"}
                ref={(node) => {
                  if (node) sectionRefs.current[group.key] = node;
                }}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <button
                  className="note-shelf-cover"
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`shelf-panel-${group.key}`}
                  onClick={() => setOpenKey((prev) => (prev === group.key ? "" : group.key))}
                >
                  <div className="note-shelf-header">
                    <div>
                      <div className="note-shelf-title">{group.label}</div>
                    </div>
                    <div className="note-shelf-header-right">
                      <span className="note-shelf-count">{group.count} notes</span>
                      <span className="note-shelf-toggle" aria-hidden="true">
                        &gt;
                      </span>
                    </div>
                  </div>
                  <div className="note-shelf-spines">
                    {previewNotes.map((note) => (
                      <span key={note.id} className="note-shelf-spine">
                        {getShortTitle(note, 18)}
                      </span>
                    ))}
                  </div>
                  {extraCount > 0 ? (
                    <div className="note-shelf-more">+{extraCount} more</div>
                  ) : null}
                </button>
                <div
                  className="note-shelf-panel"
                  id={`shelf-panel-${group.key}`}
                  style={{ maxHeight: isOpen ? `${panelMax}px` : "0px" }}
                >
                  <div className="note-shelf-panel-inner">
                    {group.notes.map((note) => (
                      <Link key={note.id} className="note-shelf-item" to={`/note/${note.id}`}>
                        <span className="note-shelf-item-title">{getShortTitle(note, 36)}</span>
                        <span className="note-shelf-item-meta">
                          {formatItemStamp(note.created_at, groupBy)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <aside className="timeline-rail" aria-label="Timeline">
        {groups.length === 0 ? (
          <div className="timeline-empty">No dates yet</div>
        ) : (
          <div className="timeline-list">
            {groups.map((group) => {
              const isMonth = groupBy === "month";
              return (
                <button
                  key={group.key}
                  className={`timeline-item ${activeKey === group.key ? "active" : ""}`}
                  type="button"
                  onClick={() => handleJump(group.key)}
                >
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="timeline-date">
                    <span className="timeline-day">{isMonth ? group.monthLabel : group.day}</span>
                    <span className="timeline-month">
                      {isMonth ? group.year || " " : group.monthLabel}
                    </span>
                  </span>
                  {!isMonth && group.year ? (
                    <span className="timeline-year">{group.year}</span>
                  ) : null}
                  <span className="timeline-count">{group.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
