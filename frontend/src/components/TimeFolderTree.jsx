import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";

const pad2 = (value) => String(value).padStart(2, "0");

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

const formatTime = (iso) => {
  if (!iso) return "";
  return iso.slice(11, 16);
};

const parseDateParts = (iso) => {
  if (!iso) return null;
  const dateKey = iso.slice(0, 10);
  const parts = dateKey.split("-");
  if (parts.length !== 3) return null;
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return null;
  }
  return { dateKey, year, month, day };
};

const getWeekOfMonth = (year, month, day) => {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = (firstDay.getUTCDay() + 6) % 7;
  return Math.floor((day + firstDow - 1) / 7) + 1;
};

const getWeekdayLabel = (year, month, day, weekdaysShort) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return weekdaysShort[date.getUTCDay()] || "";
};

const getWeekRangeLabel = (year, month, week, monthsShort) => {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = (firstDay.getUTCDay() + 6) % 7;
  const startDay = (week - 1) * 7 - firstDow + 1;
  const endDay = startDay + 6;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedStart = Math.max(1, startDay);
  const clampedEnd = Math.min(daysInMonth, endDay);
  const monthLabel = monthsShort[month - 1] || pad2(month);
  if (clampedStart === clampedEnd) {
    return `${monthLabel} ${pad2(clampedStart)}`;
  }
  return `${monthLabel} ${pad2(clampedStart)}-${pad2(clampedEnd)}`;
};

const createNode = (id, key, label, level, parentId = "") => ({
  id,
  key,
  label,
  level,
  parentId,
  notes: [],
  children: new Map(),
  latestAt: "",
});

const sortByLatest = (a, b) => {
  if (!a.latestAt) return 1;
  if (!b.latestAt) return -1;
  return a.latestAt < b.latestAt ? 1 : -1;
};

const buildTimeTree = (notes, locale) => {
  const parsed = notes.map((note) => ({ note, date: parseDateParts(note?.created_at) }));
  const counts = {
    year: new Set(),
    month: new Set(),
    week: new Set(),
    day: new Set(),
  };

  parsed.forEach(({ date }) => {
    if (!date) return;
    const monthKey = `${date.year}-${pad2(date.month)}`;
    const week = getWeekOfMonth(date.year, date.month, date.day);
    counts.year.add(String(date.year));
    counts.month.add(monthKey);
    counts.week.add(`${monthKey}-W${week}`);
    counts.day.add(date.dateKey);
  });

  const showYear = counts.year.size > 1;
  const showMonth = counts.month.size > 1;
  const showWeek = counts.week.size > 1;
  const showDay = counts.day.size > 1;
  const activeLevels = [];
  if (showYear) activeLevels.push("year");
  if (showMonth) activeLevels.push("month");
  if (showWeek) activeLevels.push("week");
  if (showDay) activeLevels.push("day");

  const sortedNotes = notes
    .slice()
    .sort((a, b) => ((a?.created_at || "") < (b?.created_at || "") ? 1 : -1));

  if (!activeLevels.length) {
    const singleDate = counts.day.size === 1 ? Array.from(counts.day)[0] : "";
    const root = createNode("root", "root", "root", "root");
    root.children = [];
    const nodeMap = new Map();
    nodeMap.set(root.id, root);
    return { root, map: nodeMap, flatNotes: sortedNotes, flatLabel: singleDate };
  }

  const root = createNode("root", "root", "root", "root");
  const nodeMap = new Map();
  nodeMap.set(root.id, root);
  let unknownNode = null;

  parsed.forEach(({ note, date }) => {
    if (!date) {
      if (!unknownNode) {
        unknownNode = createNode(
          "unknown",
          "unknown",
          locale.unknownDateLabel,
          "unknown",
          root.id
        );
        nodeMap.set(unknownNode.id, unknownNode);
      }
      unknownNode.notes.push(note);
      const stamp = note?.created_at || "";
      if (stamp && (!unknownNode.latestAt || stamp > unknownNode.latestAt)) {
        unknownNode.latestAt = stamp;
      }
      return;
    }
    const monthLabel = locale.monthsShort[date.month - 1] || pad2(date.month);
    const weekdayLabel = getWeekdayLabel(date.year, date.month, date.day, locale.weekdaysShort);
    const dayLabel = showMonth
      ? `${pad2(date.day)} ${weekdayLabel}`
      : `${monthLabel} ${pad2(date.day)} ${weekdayLabel}`;
    const monthKey = `${date.year}-${pad2(date.month)}`;
    const week = getWeekOfMonth(date.year, date.month, date.day);
    const levelInfo = {
      year: { key: String(date.year), label: String(date.year) },
      month: { key: monthKey, label: monthLabel },
      week: {
        key: `${monthKey}-W${week}`,
        label: getWeekRangeLabel(date.year, date.month, week, locale.monthsShort),
      },
      day: { key: date.dateKey, label: dayLabel },
    };
    let current = root;
    activeLevels.forEach((level) => {
      const info = levelInfo[level];
      const nodeId = `${current.id}/${info.key}`;
      let child = current.children.get(info.key);
      if (!child) {
        child = createNode(nodeId, info.key, info.label, level, current.id);
        current.children.set(info.key, child);
        nodeMap.set(nodeId, child);
      }
      child.notes.push(note);
      const stamp = note?.created_at || "";
      if (stamp && (!child.latestAt || stamp > child.latestAt)) {
        child.latestAt = stamp;
      }
      current = child;
    });
  });

  if (unknownNode) {
    unknownNode.notes.sort((a, b) => ((a?.created_at || "") < (b?.created_at || "") ? 1 : -1));
    root.children.set(unknownNode.key, unknownNode);
  }

  const finalize = (node) => {
    node.notes.sort((a, b) => ((a?.created_at || "") < (b?.created_at || "") ? 1 : -1));
    const children = Array.from(node.children.values());
    children.forEach(finalize);
    children.sort(sortByLatest);
    node.children = children;
  };

  finalize(root);
  return { root, map: nodeMap, flatNotes: [], flatLabel: "" };
};

const buildPath = (node, map) => {
  const path = [];
  let current = node;
  while (current && current.id !== "root") {
    path.unshift(current);
    if (!current.parentId) break;
    current = map.get(current.parentId);
  }
  return path;
};

export default function TimeFolderTree({ notes = [] }) {
  const { t, monthsShort, weekdaysShort } = useLanguage();
  const location = useLocation();
  const untitledLabel = t("common.untitledNote");
  const [isMobile, setIsMobile] = useState(false);
  const locale = useMemo(
    () => ({
      monthsShort,
      weekdaysShort,
      unknownDateLabel: t("common.unknownDate"),
    }),
    [monthsShort, weekdaysShort, t]
  );
  const safeNotes = Array.isArray(notes) ? notes : [];
  const { root, map, flatNotes, flatLabel } = useMemo(
    () => buildTimeTree(safeNotes, locale),
    [safeNotes, locale]
  );
  const [activeId, setActiveId] = useState("root");

  useEffect(() => {
    const fromState = location.state?.folderActiveId;
    if (fromState && map.has(fromState)) {
      setActiveId(fromState);
      return;
    }
    setActiveId("root");
  }, [safeNotes, location.state?.folderActiveId, map]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateMatch = () => setIsMobile(mediaQuery.matches);
    updateMatch();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateMatch);
    } else {
      mediaQuery.addListener(updateMatch);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", updateMatch);
      } else {
        mediaQuery.removeListener(updateMatch);
      }
    };
  }, []);

  const activeNode = map.get(activeId) || root;
  const path = buildPath(activeNode, map);
  const spineTitleLimit = isMobile ? 18 : 80;

  const renderNotes = (items) => (
    <div className="folder-notes">
      {items.map((note) => (
        <Link
          key={note.id}
          className="note-shelf-item"
          to={`/note/${note.id}`}
          state={{
            from: `${location.pathname}${location.search}`,
            folderActiveId: activeId,
          }}
        >
          <span className="note-shelf-item-title">
            {getShortTitle(note, 44, untitledLabel)}
          </span>
          <span className="note-shelf-item-meta">{formatTime(note.created_at)}</span>
        </Link>
      ))}
    </div>
  );

  const renderNode = (node) => {
    const preview = node.notes.slice(0, 4);
    const extraCount = Math.max(0, node.notes.length - preview.length);
    return (
      <div key={node.id} className="folder-node">
        <button
          className="folder-head"
          type="button"
          onClick={() => setActiveId(node.id)}
        >
          <div className="folder-title">{node.label}</div>
          <div className="folder-meta">
            <span className="folder-count">
              {t("common.notesCount", { count: node.notes.length })}
            </span>
            <span className="folder-toggle" aria-hidden="true">
              &gt;
            </span>
          </div>
        </button>
        <div className="note-shelf-spines">
          {preview.map((note) => (
            <Link
              key={note.id}
              className="note-shelf-spine"
              to={`/note/${note.id}`}
              state={{
                from: `${location.pathname}${location.search}`,
                folderActiveId: activeId,
              }}
            >
              {getShortTitle(note, spineTitleLimit, untitledLabel)}
            </Link>
          ))}
        </div>
        {extraCount > 0 ? (
          <div className="folder-more">{t("common.notesMore", { count: extraCount })}</div>
        ) : null}
      </div>
    );
  };

  if (!safeNotes.length) {
    return <div className="empty-state">{t("common.noNotes")}</div>;
  }

  if (!root.children.length) {
    return (
      <div className="folder-view folder-flat">
        {flatLabel ? <div className="folder-flat-title">{flatLabel}</div> : null}
        {renderNotes(flatNotes)}
      </div>
    );
  }

  const showNotes = activeNode.children.length === 0;
  const activeLabel = path.length ? path[path.length - 1].label : "";

  return (
    <div className="folder-view">
      {activeNode.id !== "root" ? (
        <div className="folder-nav">
          <button
            className="btn btn-ghost folder-back"
            type="button"
            onClick={() => setActiveId(activeNode.parentId || "root")}
          >
            {t("common.back")}
          </button>
          <div className="folder-current">{activeLabel}</div>
        </div>
      ) : null}
      {showNotes ? (
        renderNotes(activeNode.notes)
      ) : (
        <div className="folder-tree">
          {activeNode.children.map((node) => renderNode(node))}
        </div>
      )}
    </div>
  );
}
