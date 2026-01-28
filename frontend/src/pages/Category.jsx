import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { apiFetch, listNotes, uploadAttachment, updateNote } from "../api";
import NoteCard from "../components/NoteCard";
import TimeFolderTree from "../components/TimeFolderTree";
import FolderTree from "../components/FolderTree";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Category() {
  const { type } = useParams();
  const { t, formatCategoryLabel } = useLanguage();
  const settings = useSettings();
  const categoryLabel = settings?.categoryLabels?.[type] || formatCategoryLabel(type);
  const showCompleted = settings?.showCompleted ?? false;
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("cards");
  const [isMobile, setIsMobile] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(true);
  const captureRef = useRef(null);
  const searchRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resizeTextareaToFit = (textarea) => {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const loadNotes = async (nextPage = 1, { append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const data = await listNotes({
        page: nextPage,
        pageSize: 50,
        category: type,
        q: query || undefined,
        includeContent: false,
        includeCompleted: showCompleted,
      });
      const items = Array.isArray(data.items) ? data.items : [];
      setNotes((prev) => (append ? [...prev, ...items] : items));
      setTotal(Number.isFinite(data.total) ? data.total : items.length);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || t("errors.loadNotes"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (loadingMore || loading) return;
    if (notes.length >= total) return;
    loadNotes(page + 1, { append: true });
  };

  useEffect(() => {
    setSearchInput("");
    setQuery("");
    setTitle("");
    setContent("");
    setDraftId(null);
    setNotes([]);
    setTotal(0);
    setPage(1);
  }, [type]);

  useEffect(() => {
    loadNotes(1, { append: false });
  }, [type, query, showCompleted]);

  const hasMore = notes.length < total;
  const subtitle = useMemo(() => {
    if (loading) return t("category.loadingNotes");
    if (!notes.length) {
      return query ? t("category.emptyNoMatch") : t("category.emptyNoNotes");
    }
    return t("common.notesCount", { count: total || notes.length });
  }, [loading, notes.length, query, t, total]);

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

  useEffect(() => {
    if (isMobile) {
      setCaptureOpen(false);
      setSearchOpen(false);
    } else {
      setCaptureOpen(true);
      setSearchOpen(true);
    }
  }, [isMobile]);

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
    if (!captureOpen) return;
    const textarea = captureRef.current;
    if (!textarea) return;
    requestAnimationFrame(() => resizeTextareaToFit(textarea));
  }, [captureOpen, content]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const trimmedTitle = title.trim();
      const trimmedFolder = folder.trim();
      const note = await apiFetch(draftId ? `/notes/${draftId}` : "/notes", {
        method: draftId ? "PUT" : "POST",
        body: draftId
          ? {
              content,
              category: type,
              title: trimmedTitle || undefined,
              folder: trimmedFolder || undefined,
              reanalyze: true,
            }
          : {
              content,
              category: type,
              title: trimmedTitle || undefined,
              folder: trimmedFolder || undefined,
            },
      });
      setTitle("");
      setFolder("");
      setContent("");
      setDraftId(null);
      setNotes((prev) => {
        const next = prev.filter((item) => item.id !== note.id);
        return [note, ...next];
      });
    } catch (err) {
      setError(err.message || t("errors.saveNote"));
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
      return;
    }
    if (handleNumberedListEnter(event, content, setContent)) {
      return;
    }
  };

  const insertAtCursor = (text) => {
    const target = captureRef.current;
    if (!target || typeof target.selectionStart !== "number") {
      const nextValue = `${content}${text}`;
      setContent(nextValue);
      return nextValue;
    }
    const { selectionStart, selectionEnd } = target;
    const nextValue = `${content.slice(0, selectionStart)}${text}${content.slice(selectionEnd)}`;
    setContent(nextValue);
    const cursor = selectionStart + text.length;
    requestAnimationFrame(() => {
      target.focus();
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
    return nextValue;
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      let noteId = draftId;
      if (!noteId) {
        const trimmedTitle = title.trim();
        const trimmedFolder = folder.trim();
        const createPayload = {
          content: content.trim() ? content : " ",
          title: trimmedTitle || undefined,
          folder: trimmedFolder || undefined,
          category: type,
        };
        const note = await apiFetch("/notes", {
          method: "POST",
          body: createPayload,
        });
        noteId = note.id;
        setDraftId(noteId);
        setNotes((prev) => [note, ...prev]);
      }

      const attachment = await uploadAttachment(file, noteId);
      const isImage = (attachment.mime_type || "").startsWith("image/");
      const markdown = isImage
        ? `![${attachment.filename}](${attachment.url})`
        : `[${attachment.filename}](${attachment.url})`;
      const nextContent = insertAtCursor(markdown);
      const trimmedTitle = title.trim();
      const trimmedFolder = folder.trim();
      await apiFetch(`/notes/${noteId}`, {
        method: "PUT",
        body: {
          content: nextContent,
          reanalyze: false,
          title: trimmedTitle || undefined,
          folder: trimmedFolder || undefined,
          category: type,
        },
      });
    } catch (err) {
      setError(err.message || t("errors.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const getClipboardFiles = (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return [];
    const files = [];
    const addFile = (file) => {
      if (!file) return;
      const exists = files.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.type === file.type
      );
      if (!exists) {
        files.push(file);
      }
    };
    const items = clipboard.items;
    if (items) {
      for (const item of items) {
        if (item.kind !== "file") continue;
        addFile(item.getAsFile());
      }
    }
    if (clipboard.files && clipboard.files.length) {
      for (const file of clipboard.files) {
        addFile(file);
      }
    }
    return files;
  };

  const handlePaste = async (event) => {
    const files = getClipboardFiles(event);
    if (!files.length) return;
    event.preventDefault();
    for (const file of files) {
      await handleUpload(file);
    }
  };

  const handleNumberedListEnter = (event, value, setValue) => {
    if (event.key !== "Enter") return false;
    const target = event.target;
    if (!target || typeof target.selectionStart !== "number") return false;
    const { selectionStart, selectionEnd } = target;
    if (selectionStart !== selectionEnd) return false;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = value.indexOf("\n", selectionStart);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lineText = value.slice(lineStart, lineEnd);
    const match = lineText.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (!match) return false;
    event.preventDefault();
    const indent = match[1];
    const number = Number.parseInt(match[2], 10);
    const rest = match[3];
    if (!rest.trim()) {
      const before = value.slice(0, lineStart);
      const after = value.slice(lineEnd);
      const trimmedAfter = after.startsWith("\n") ? after.slice(1) : after;
      const nextValue = `${before}${indent}${trimmedAfter}`;
      setValue(nextValue);
      const cursor = lineStart + indent.length;
      requestAnimationFrame(() => {
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
      });
      return true;
    }
    const insertText = `\n${indent}${number + 1}. `;
    const nextValue = `${value.slice(0, selectionStart)}${insertText}${value.slice(
      selectionStart
    )}`;
    setValue(nextValue);
    const cursor = selectionStart + insertText.length;
    requestAnimationFrame(() => {
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
    return true;
  };

  const handleInsertNumbered = () => {
    const target = captureRef.current;
    if (!target) return;
    const { selectionStart, selectionEnd } = target;
    if (selectionStart !== selectionEnd) {
      const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
      let lineEnd = content.indexOf("\n", selectionEnd);
      if (lineEnd === -1) lineEnd = content.length;
      const block = content.slice(lineStart, lineEnd);
      let index = 1;
      const withNumbers = block
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          const stripped = line
            .replace(/^\s*\d+\.\s+/, "")
            .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
            .replace(/^\s*[-*+]\s+/, "");
          const nextLine = `${index}. ${stripped}`;
          index += 1;
          return nextLine;
        })
        .join("\n");
      const nextValue = `${content.slice(0, lineStart)}${withNumbers}${content.slice(lineEnd)}`;
      setContent(nextValue);
      const cursorStart = lineStart;
      const cursorEnd = lineStart + withNumbers.length;
      requestAnimationFrame(() => {
        target.focus();
        target.selectionStart = cursorStart;
        target.selectionEnd = cursorEnd;
      });
      return;
    }
    const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = content.indexOf("\n", selectionStart);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const lineText = content.slice(lineStart, lineEnd);
    const match = lineText.match(/^(\s*)(\d+)\.\s/);
    const insertText = match
      ? `\n${match[1]}${Number.parseInt(match[2], 10) + 1}. `
      : lineText.trim().length === 0
        ? "1. "
        : "\n1. ";
    const nextValue = `${content.slice(0, selectionStart)}${insertText}${content.slice(
      selectionEnd
    )}`;
    setContent(nextValue);
    const cursor = selectionStart + insertText.length;
    requestAnimationFrame(() => {
      target.focus();
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
  };

  const handleInsertChecklist = () => {
    const target = captureRef.current;
    if (!target) return;
    const { selectionStart, selectionEnd } = target;
    if (selectionStart !== selectionEnd) {
      const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
      let lineEnd = content.indexOf("\n", selectionEnd);
      if (lineEnd === -1) lineEnd = content.length;
      const block = content.slice(lineStart, lineEnd);
      const withChecklist = block
        .split("\n")
        .map((line) => {
          if (!line.trim()) return line;
          if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) return line;
          return `- [ ] ${line}`;
        })
        .join("\n");
      const nextValue = `${content.slice(0, lineStart)}${withChecklist}${content.slice(lineEnd)}`;
      setContent(nextValue);
      const cursorStart = lineStart;
      const cursorEnd = lineStart + withChecklist.length;
      requestAnimationFrame(() => {
        target.focus();
        target.selectionStart = cursorStart;
        target.selectionEnd = cursorEnd;
      });
      return;
    }
    const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineText = content.slice(lineStart, selectionStart);
    const insertText = lineText.trim().length === 0 ? "- [ ] " : "\n- [ ] ";
    const nextValue = `${content.slice(0, selectionStart)}${insertText}${content.slice(
      selectionEnd
    )}`;
    setContent(nextValue);
    const cursor = selectionStart + insertText.length;
    requestAnimationFrame(() => {
      target.focus();
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setQuery("");
  };

  const handleToggleComplete = async (note) => {
    if (!note) return;
    setError("");
    try {
      const nextCompleted = !note.completed;
      const data = await apiFetch(`/notes/${note.id}`, {
        method: "PUT",
        body: {
          completed: nextCompleted,
          reanalyze: false,
        },
      });
      setNotes((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      );
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    }
  };

  const handleTogglePin = async (note) => {
    if (!note) return;
    setError("");
    try {
      const nextPinnedCategory = !note.pinned_category;
      const data = await updateNote(note.id, {
        pinned_category: nextPinnedCategory,
        reanalyze: false,
      });
      setNotes((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      );
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    }
  };

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{categoryLabel}</div>
          <div className="page-subtitle">
            {query ? t("category.filteredWithSearch", { query }) : subtitle}
          </div>
        </div>
        <div className="view-controls">
          <div className="toggle-block">
            <span className="toggle-label">{t("common.view")}</span>
            <div className="toggle-group" role="group" aria-label={t("common.view")}>
              <button
                className={`toggle-btn ${viewMode === "folders" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("folders")}
              >
                {t("category.viewTimeFolders")}
              </button>
              <button
                className={`toggle-btn ${viewMode === "structure" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("structure")}
              >
                {t("category.viewStructure")}
              </button>
              <button
                className={`toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                type="button"
                onClick={() => setViewMode("cards")}
              >
                {t("category.viewCards")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card quick-capture">
        <div className={`collapsible-panel ${captureOpen ? "open" : ""}`}>
          <button
            className="collapsible-header"
            type="button"
            onClick={() => setCaptureOpen((prev) => !prev)}
            aria-expanded={captureOpen}
            aria-controls="category-capture-panel"
          >
            <span>{t("category.quickCapture")}</span>
            <span className="collapsible-icon">{captureOpen ? "-" : "+"}</span>
          </button>
          <div className="collapsible-body" id="category-capture-panel">
            <div className="section">
              <input
                type="text"
                placeholder={t("category.titlePlaceholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <input
                type="text"
                className="input-sm"
                placeholder={t("category.folderPlaceholder")}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                list="folder-suggestions"
              />
              <datalist id="folder-suggestions">
                {Array.from(new Set(notes.map(n => n.folder).filter(Boolean))).sort().map(f => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <textarea
                ref={captureRef}
                placeholder={t("category.capturePlaceholder", { category: categoryLabel })}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  resizeTextareaToFit(event.target);
                }}
                onInput={(event) => resizeTextareaToFit(event.target)}
                onKeyDown={handleCaptureKeyDown}
                onPaste={handlePaste}
              />
              <div className="editor-toolbar">
                <button
                  className="editor-btn"
                  type="button"
                  onClick={handleInsertNumbered}
                  aria-label="Insert numbered list"
                >
                  编号
                </button>
                <button
                  className="editor-btn"
                  type="button"
                  onClick={handleInsertChecklist}
                  aria-label="Insert checklist"
                >
                  待办
                </button>
                <button
                  className="editor-btn"
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                >
                  {t("editor.uploadImage")}
                </button>
                <button
                  className="editor-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {t("editor.uploadFile")}
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    handleUpload(file);
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    handleUpload(file);
                  }}
                />
              </div>
              <div className="capture-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving ? t("common.saving") : t("common.saveNote")}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className={`collapsible-panel ${searchOpen ? "open" : ""}`}>
          <button
            className="collapsible-header"
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            aria-expanded={searchOpen}
            aria-controls="category-search-panel"
          >
            <span>{t("common.search")}</span>
            <span className="collapsible-icon">{searchOpen ? "-" : "+"}</span>
          </button>
          <div className="collapsible-body" id="category-search-panel">
            <div className="quick-actions">
              <div className="section">
                <form onSubmit={handleSearch} className="section">
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder={t("category.searchPlaceholder", { category: categoryLabel })}
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  <div className="btn-row">
                    <button className="btn btn-outline" type="submit">
                      {t("common.search")}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={handleClearSearch}
                    >
                      {t("common.clear")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <div className="empty-state">{t("category.loadingNotes")}</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          {query ? t("category.emptyNoMatch") : t("category.emptyNoNotes")}
        </div>
      ) : viewMode === "folders" ? (
        <TimeFolderTree notes={notes} />
      ) : viewMode === "structure" ? (
        <FolderTree notes={notes} />
      ) : (
        <>
          <div className="note-grid">
            {notes.map((note, index) => (
              <NoteCard
                key={note.id}
                note={note}
                index={index}
                onDelete={() => handleDelete(note.id)}
                onToggleComplete={handleToggleComplete}
                onTogglePin={handleTogglePin}
                pinScope="category"
                isMobile={isMobile}
              />
            ))}
          </div>
          {hasMore ? (
            <div className="tag-load-more">
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t("common.loading") : t("tags.loadMore")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
