import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

import MarkdownContent from "./MarkdownContent";

const truncate = (text, limit = 200) => {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const formatTime = (iso) => {
  if (!iso) return "";
  return iso.slice(11, 16);
};

const countUnits = (text) => {
  let units = 0;
  for (const char of text) {
    units += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return units;
};

const buildPreview = (note, mode) => {
  const content = typeof note?.content === "string" ? note.content.trim() : "";
  const summary = typeof note?.ai_summary === "string" ? note.ai_summary.trim() : "";
  if (mode === "timeline") {
    if (content && countUnits(content) <= 300) return content;
    if (summary) return summary;
    if (content) return content;
  }
  return content || summary || note?.short_title || note?.title || "";
};

export default function NoteCard({
  note,
  index = 0,
  onDelete,
  previewMode,
  enableCategoryEdit = false,
  onUpdateCategory,
  onToggleComplete,
  onTogglePin,
  isMobile = false,
}) {
  const { t, language, formatCategoryLabel, formatMatchType } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  const categories = settings?.categories || [];
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const categoryRef = useRef(null);
  const isCompleted = Boolean(note.completed);
  const isPinnedGlobal = Boolean(note.pinned_global);
  const isPinnedCategory = Boolean(note.pinned_category);
  const fromPath = `${location.pathname}${location.search}`;
  const categoryLabel =
    settings?.categoryLabels?.[note.ai_category] ||
    formatCategoryLabel(note.ai_category || "idea");
  const currentCategory = note.ai_category || "";
  const canEditCategory =
    enableCategoryEdit && typeof onUpdateCategory === "function" && categories.length > 0;
  const tags = note.ai_tags || [];
  const title = note.title || note.ai_summary || t("common.untitledNote");
  const preview = buildPreview(note, previewMode);
  const searchInfo = note.search_info;
  const matchType = searchInfo?.match_type || "";
  const matchedKeywords = searchInfo?.matched_keywords || [];
  const similarity =
    typeof searchInfo?.similarity === "number" ? searchInfo.similarity : null;
  const showSimilarity = matchType.includes("semantic") && similarity !== null;
  const matchLabel = formatMatchType(matchType);
  const resolveLabel = (key, fallback) => {
    if (typeof t !== "function") return fallback || key;
    const value = t(key);
    if (!value || value === key) return fallback || value;
    return value;
  };
  const pinLabel = isPinnedGlobal || isPinnedCategory
    ? resolveLabel("common.unpin", language === "zh" ? "取消置顶" : "Unpin")
    : resolveLabel("common.pin", language === "zh" ? "置顶" : "Pin");
  const handleOpen = (event) => {
    if (event.defaultPrevented) return;
    const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
    if (selection && !selection.isCollapsed) {
      const container = event.currentTarget;
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (
        (container && anchorNode && container.contains(anchorNode)) ||
        (container && focusNode && container.contains(focusNode))
      ) {
        return;
      }
    }
    const target = event.target;
    const ignore = target?.closest?.(
      "a, button, input, textarea, select, [data-note-action]"
    );
    if (ignore) return;
    navigate(`/note/${note.id}`, { state: { from: fromPath } });
  };
  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm(t("note.deleteConfirm"));
    if (!confirmed) return;
    await onDelete(note);
  };
  const handleCategoryToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEditCategory || categorySaving) return;
    setCategoryOpen((prev) => !prev);
  };
  const handleCategoryClose = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setCategoryOpen(false);
  };
  const handleCategorySelect = async (nextKey) => {
    if (!canEditCategory || categorySaving) return;
    if (nextKey === currentCategory) {
      setCategoryOpen(false);
      return;
    }
    setCategorySaving(true);
    try {
      const updated = await onUpdateCategory(note, nextKey);
      if (updated) {
        setCategoryOpen(false);
      }
    } finally {
      setCategorySaving(false);
    }
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    if (onToggleComplete) {
      onToggleComplete(note);
    }
  };

  const handlePinToggle = (event) => {
    event.stopPropagation();
    if (onTogglePin) {
      onTogglePin(note);
    }
  };

  useEffect(() => {
    if (!categoryOpen) return;
    const handleOutside = (event) => {
      if (!categoryRef.current) return;
      if (categoryRef.current.contains(event.target)) return;
      setCategoryOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [categoryOpen]);

  useEffect(() => {
    if (!canEditCategory && categoryOpen) {
      setCategoryOpen(false);
    }
  }, [canEditCategory, categoryOpen]);

  useEffect(() => {
    if (categoryOpen) {
      setCategoryOpen(false);
    }
  }, [note.ai_category]);
  return (
    <div
      className={`note-card ${isCompleted ? "note-card-completed" : ""} ${previewMode === "timeline" ? "note-card-timeline" : ""} ${isPinnedGlobal || isPinnedCategory ? "note-card-pinned" : ""}`}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={handleOpen}
    >
      <div className="note-meta">
        {canEditCategory ? (
          <div className="category-trigger" ref={categoryRef} data-note-action>
            <button
              className="badge badge-action"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={categoryOpen}
              onClick={handleCategoryToggle}
              disabled={categorySaving}
            >
              {categoryLabel}
            </button>
            {categoryOpen && !isMobile ? (
              <div
                className="category-popover"
                role="listbox"
                aria-label={t("common.category")}
              >
                <div className="category-popover-title">
                  <span>{t("common.category")}</span>
                  {categorySaving ? (
                    <span className="category-saving">{t("common.saving")}</span>
                  ) : null}
                </div>
                <div className="category-popover-options">
                  {categories.map((category) => {
                    const active = currentCategory === category.key;
                    return (
                      <button
                        key={category.key}
                        type="button"
                        className={`category-option-btn ${active ? "active" : ""}`}
                        role="option"
                        aria-selected={active}
                        onClick={() => handleCategorySelect(category.key)}
                        disabled={categorySaving}
                      >
                        <span>{category.label}</span>
                        {active ? (
                          <span className="category-option-indicator" aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {categoryOpen && isMobile ? (
              <div
                className="category-sheet-backdrop"
                data-note-action
                onClick={handleCategoryClose}
              >
                <div
                  className="category-sheet"
                  role="dialog"
                  aria-label={t("common.category")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="category-sheet-header">
                    <span>{t("common.category")}</span>
                    <button
                      className="category-sheet-close"
                      type="button"
                      aria-label={t("common.cancel")}
                      onClick={handleCategoryClose}
                    >
                      x
                    </button>
                  </div>
                  <div className="category-sheet-options">
                    {categories.map((category) => {
                      const active = currentCategory === category.key;
                      return (
                        <button
                          key={category.key}
                          type="button"
                          className={`category-option-btn ${active ? "active" : ""}`}
                          role="option"
                          aria-selected={active}
                          onClick={() => handleCategorySelect(category.key)}
                          disabled={categorySaving}
                        >
                          <span>{category.label}</span>
                          {active ? (
                            <span className="category-option-indicator" aria-hidden="true" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {categorySaving ? (
                    <div className="category-saving">{t("common.saving")}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="badge">{categoryLabel}</span>
        )}
        {note.folder ? (
          <span className="badge badge-outline" title={t("common.folder")}>
            {note.folder}
          </span>
        ) : null}
        <span>{formatTime(note.created_at)}</span>
        {note.ai_sensitivity === "high" ? (
          <span className="badge">{t("common.sensitive")}</span>
        ) : null}
        {(isPinnedGlobal || isPinnedCategory) ? (
          <span className="pin-indicator" title={t("common.pinned")}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M16 4h1v12l-1 2-1-2V4zM9 4v12l-1 2-1-2V4h2zm7-2H8a1 1 0 0 0-1 1v1h11V3a1 1 0 0 0-1-1z"/>
            </svg>
          </span>
        ) : null}
        {onToggleComplete ? (
          <button
            className={`note-toggle-status ${isCompleted ? "completed" : ""}`}
            type="button"
            onClick={handleToggle}
            title={isCompleted ? "Mark as in-progress" : "Mark as completed"}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isCompleted ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <circle cx="12" cy="12" r="9" />
              )}
            </svg>
          </button>
        ) : null}
      </div>
      {searchInfo ? (
        <div className="search-meta">
          {matchLabel ? <span>{t("note.matchLabel", { match: matchLabel })}</span> : null}
          {matchedKeywords.length ? (
            <span>
              {t("note.keywordsLabel", { keywords: matchedKeywords.join(", ") })}
            </span>
          ) : null}
          {showSimilarity ? (
            <span>{t("note.similarityLabel", { score: similarity.toFixed(3) })}</span>
          ) : null}
        </div>
      ) : null}
      <div className="note-card-body" data-note-action>
        <h3>{title}</h3>
        <MarkdownContent content={truncate(preview, 300)} />
      </div>
      <div className="tag-row">
        {tags.slice(0, 4).map((tag) => (
          <Link key={tag} className="tag tag-link" to={`/tags?tag=${encodeURIComponent(tag)}`}>
            {tag}
          </Link>
        ))}
      </div>
      <div className="note-card-actions">
        <Link
          className="muted"
          to={`/note/${note.id}`}
          state={{ from: fromPath }}
        >
          {t("note.openDetail")}
        </Link>
        {onTogglePin ? (
          <button 
            className="btn btn-ghost" 
            type="button" 
            onClick={handlePinToggle}
            title={pinLabel}
          >
            {pinLabel}
          </button>
        ) : null}
        {onDelete ? (
          <button className="btn btn-ghost" type="button" onClick={handleDelete}>
            {t("common.delete")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
