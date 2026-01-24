import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";

const truncate = (text, limit) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const getTitle = (note, untitledLabel) => {
  const raw = note?.short_title || note?.title || note?.ai_summary || untitledLabel;
  const trimmed = String(raw || "").trim();
  return trimmed || untitledLabel;
};

const getShortTitle = (note, limit, untitledLabel) =>
  truncate(getTitle(note, untitledLabel), limit);

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

const buildGroupMeta = (key, groupBy, monthsShort, unknownLabel) => {
  if (!key || key === "unknown") {
    return {
      label: unknownLabel,
      year: "",
      monthLabel: unknownLabel,
      day: "",
    };
  }
  const [year, month, day] = key.split("-");
  const monthIndex = Math.max(0, Number.parseInt(month, 10) - 1);
  const monthLabel = monthsShort[monthIndex] || month;
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
  const { t, monthsShort } = useLanguage();
  const location = useLocation();
  const untitledLabel = t("common.untitledNote");
  const unknownLabel = t("common.unknown");
  const safeNotes = Array.isArray(notes) ? notes : [];
  const [openKey, setOpenKey] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const sectionRefs = useRef({});
  const timelineListRef = useRef(null);

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
          ...buildGroupMeta(key, groupBy, monthsShort, unknownLabel),
        };
      }),
    [groupKeys, grouped, groupBy, monthsShort, unknownLabel]
  );

  useEffect(() => {
    setOpenKey("");
  }, [groupBy]);

  useEffect(() => {
    if (!groupKeys.length) {
      setActiveKey("");
      return;
    }
    const updateActive = () => {
      const anchor = window.innerHeight * 0.25;
      let nextKey = "";
      let closest = Number.POSITIVE_INFINITY;
      groupKeys.forEach((key) => {
        const el = sectionRefs.current[key];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom <= 0) return;
        const distance = Math.abs(rect.top - anchor);
        if (distance < closest) {
          closest = distance;
          nextKey = key;
        }
      });
      if (nextKey) {
        setActiveKey((prev) => (prev === nextKey ? prev : nextKey));
      }
    };
    let rafId = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActive();
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [groupKeys]);

  const handleJump = (key) => {
    const target = sectionRefs.current[key];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const listEl = timelineListRef.current;
    if (!listEl || !activeKey) return;
    const activeEl = listEl.querySelector(`[data-group="${activeKey}"]`);
    if (!activeEl) return;
    requestAnimationFrame(() => {
      const targetTop =
        activeEl.offsetTop - (listEl.clientHeight / 2 - activeEl.offsetHeight / 2);
      listEl.scrollTop = Math.max(0, targetTop);
    });
  }, [activeKey]);

  if (!groupKeys.length) {
    return <div className="empty-state">{t("common.noNotes")}</div>;
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
                      <span className="note-shelf-count">
                        {t("common.notesCount", { count: group.count })}
                      </span>
                      <span className="note-shelf-toggle" aria-hidden="true">
                        &gt;
                      </span>
                    </div>
                  </div>
                  <div className="note-shelf-spines">
                    {previewNotes.map((note) => (
                      <span key={note.id} className="note-shelf-spine">
                        {getShortTitle(note, 18, untitledLabel)}
                      </span>
                    ))}
                  </div>
                  {extraCount > 0 ? (
                    <div className="note-shelf-more">
                      {t("common.notesMore", { count: extraCount })}
                    </div>
                  ) : null}
                </button>
                <div
                  className="note-shelf-panel"
                  id={`shelf-panel-${group.key}`}
                  style={{ maxHeight: isOpen ? `${panelMax}px` : "0px" }}
                >
                  <div className="note-shelf-panel-inner">
                    {group.notes.map((note) => (
                      <Link
                        key={note.id}
                        className="note-shelf-item"
                        to={`/note/${note.id}`}
                        state={{ from: `${location.pathname}${location.search}` }}
                      >
                        <span className="note-shelf-item-title">
                          {getShortTitle(note, 36, untitledLabel)}
                        </span>
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
      <aside className="timeline-rail" aria-label={t("nav.timeline")}>
        {groups.length === 0 ? (
          <div className="timeline-empty">{t("common.noDates")}</div>
        ) : (
          <div className="timeline-list" ref={timelineListRef}>
            {groups.map((group) => {
              const isMonth = groupBy === "month";
              return (
                <button
                  key={group.key}
                  className={`timeline-item ${activeKey === group.key ? "active" : ""}`}
                  data-group={group.key}
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
