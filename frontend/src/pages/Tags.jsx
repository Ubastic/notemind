import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiFetch } from "../api";
import NoteCard from "../components/NoteCard";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

const TAGS_PAGE_SIZE = 100;
const NOTES_PAGE_SIZE = 24;

const normalizeTag = (value) => String(value || "").trim();

const buildTagStats = (notes) => {
  const map = new Map();
  notes.forEach((note) => {
    const tags = Array.isArray(note?.ai_tags) ? note.ai_tags : [];
    tags.forEach((tag) => {
      const cleaned = normalizeTag(tag);
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, label: cleaned, count: 1 });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
};

export default function Tags() {
  const { t } = useLanguage();
  const settings = useSettings();
  const showCompleted = settings?.showCompleted ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParam = searchParams.get("tag") || "";
  const [tagSearch, setTagSearch] = useState("");
  const [tagStats, setTagStats] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState("");
  const [notes, setNotes] = useState([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesLoadingMore, setNotesLoadingMore] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesPage, setNotesPage] = useState(1);
  const activeTag = tagParam;

  const setActiveTagParam = (value) => {
    const trimmed = normalizeTag(value);
    const nextParams = new URLSearchParams(searchParams);
    if (trimmed) {
      nextParams.set("tag", trimmed);
    } else {
      nextParams.delete("tag");
    }
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    let active = true;
    const loadTags = async () => {
      setTagsLoading(true);
      setTagsError("");
      try {
        const allNotes = [];
        let page = 1;
        let total = 0;
        do {
          const params = new URLSearchParams({
            page: String(page),
            page_size: String(TAGS_PAGE_SIZE),
            include_content: "false",
            include_completed: showCompleted ? "true" : "false",
          });
          const data = await apiFetch(`/notes?${params.toString()}`);
          total = Number.isFinite(data.total) ? data.total : total;
          allNotes.push(...(data.items || []));
          page += 1;
        } while (allNotes.length < total);
        if (!active) return;
        setTagStats(buildTagStats(allNotes));
      } catch (err) {
        if (!active) return;
        setTagsError(err.message || t("errors.loadNotes"));
      } finally {
        if (active) setTagsLoading(false);
      }
    };
    loadTags();
    return () => {
      active = false;
    };
  }, [showCompleted, t]);

  useEffect(() => {
    const trimmed = activeTag.trim();
    if (!trimmed) {
      setNotes([]);
      setNotesTotal(0);
      setNotesLoading(false);
      setNotesLoadingMore(false);
      setNotesPage(1);
      return;
    }
    let active = true;
    const loadNotes = async () => {
      setNotesLoading(true);
      setNotesError("");
      try {
        const params = new URLSearchParams({
          page: "1",
          page_size: String(NOTES_PAGE_SIZE),
          include_content: "false",
          include_completed: showCompleted ? "true" : "false",
          tag: trimmed,
        });
        const data = await apiFetch(`/notes?${params.toString()}`);
        if (!active) return;
        setNotes(data.items || []);
        setNotesTotal(Number.isFinite(data.total) ? data.total : data.items?.length || 0);
        setNotesPage(1);
      } catch (err) {
        if (!active) return;
        setNotesError(err.message || t("errors.loadNotes"));
      } finally {
        if (active) setNotesLoading(false);
      }
    };
    loadNotes();
    return () => {
      active = false;
    };
  }, [activeTag, showCompleted, t]);

  const handleLoadMore = async () => {
    const trimmed = activeTag.trim();
    if (!trimmed || notesLoading || notesLoadingMore) return;
    const nextPage = notesPage + 1;
    setNotesLoadingMore(true);
    setNotesError("");
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(NOTES_PAGE_SIZE),
        include_content: "false",
        include_completed: showCompleted ? "true" : "false",
        tag: trimmed,
      });
      const data = await apiFetch(`/notes?${params.toString()}`);
      setNotes((prev) => [...prev, ...(data.items || [])]);
      setNotesTotal(Number.isFinite(data.total) ? data.total : notesTotal);
      setNotesPage(nextPage);
    } catch (err) {
      setNotesError(err.message || t("errors.loadNotes"));
    } finally {
      setNotesLoadingMore(false);
    }
  };

  const filteredTags = useMemo(() => {
    const term = tagSearch.trim().toLowerCase();
    if (!term) return tagStats;
    return tagStats.filter((tag) => tag.label.toLowerCase().includes(term));
  }, [tagSearch, tagStats]);

  const activeTagKey = activeTag.trim().toLowerCase();
  const hasMore = notes.length < notesTotal;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("tags.title")}</div>
          <div className="page-subtitle">{t("tags.subtitle")}</div>
        </div>
      </div>

      <div className="tag-layout">
        <aside className="card tag-panel">
          <div className="card-header">
            <div className="card-title">{t("tags.tagList")}</div>
          </div>
          <div className="section">
            <input
              type="text"
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder={t("tags.searchPlaceholder")}
            />
            {tagsError ? <div className="error">{tagsError}</div> : null}
            {tagsLoading ? (
              <div className="empty-state">{t("tags.loadingTags")}</div>
            ) : filteredTags.length === 0 ? (
              <div className="empty-state">{t("tags.emptyTags")}</div>
            ) : (
              <div className="tag-list">
                {filteredTags.map((tag) => {
                  const isActive = tag.key === activeTagKey;
                  return (
                    <button
                      key={tag.key}
                      className={`tag-pill ${isActive ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveTagParam(tag.label)}
                      aria-pressed={isActive}
                    >
                      <span>{tag.label}</span>
                      <span className="tag-count">{tag.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="tag-results">
          <div className="tag-results-header">
            <div>
              <div className="section-title">{t("tags.activeTag")}</div>
              <div className="tag-active">
                {activeTag.trim() ? (
                  <>
                    <span className="tag tag-large">{activeTag}</span>
                    <span className="badge">{t("common.notesCount", { count: notesTotal })}</span>
                  </>
                ) : (
                  <span className="muted">{t("tags.selectHint")}</span>
                )}
              </div>
            </div>
            {activeTag.trim() ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setActiveTagParam("")}
              >
                {t("common.clear")}
              </button>
            ) : null}
          </div>

          {notesError ? <div className="error">{notesError}</div> : null}
          {!activeTag.trim() ? (
            <div className="empty-state">{t("tags.selectHint")}</div>
          ) : notesLoading ? (
            <div className="empty-state">{t("tags.loadingNotes")}</div>
          ) : notes.length === 0 ? (
            <div className="empty-state">{t("tags.emptyNotes")}</div>
          ) : (
            <>
              <div className="note-grid">
                {notes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} />
                ))}
              </div>
              {hasMore ? (
                <div className="tag-load-more">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={handleLoadMore}
                    disabled={notesLoadingMore}
                  >
                    {notesLoadingMore ? t("tags.loadingMore") : t("tags.loadMore")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
