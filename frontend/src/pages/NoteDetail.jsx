import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { apiFetch, uploadAttachment } from "../api";
import MarkdownContent from "../components/MarkdownContent";
import NoteCard from "../components/NoteCard";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, formatCategoryLabel, formatSensitivity } = useLanguage();
  const settings = useSettings();
  const showCompleted = settings?.showCompleted ?? false;
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [shortTitle, setShortTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [folder, setFolder] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [relatedMode, setRelatedMode] = useState("");
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const detailRef = useRef(null);
  const contentRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const resizeTextareaToFit = (textarea) => {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const TASK_ITEM_REGEX = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/;
  const FENCE_REGEX = /^\s*(```|~~~)/;

  const toggleTaskAtIndex = (source, index) => {
    if (typeof source !== "string") return source;
    const lines = source.split("\n");
    let current = -1;
    let changed = false;
    let inFence = false;
    let fenceToken = "";

    const nextLines = lines.map((rawLine) => {
      const hasCarriage = rawLine.endsWith("\r");
      const line = hasCarriage ? rawLine.slice(0, -1) : rawLine;
      const fenceMatch = line.match(FENCE_REGEX);

      if (fenceMatch) {
        if (!inFence) {
          inFence = true;
          fenceToken = fenceMatch[1];
        } else if (fenceMatch[1] === fenceToken) {
          inFence = false;
          fenceToken = "";
        }
        return rawLine;
      }

      if (inFence) {
        return rawLine;
      }

      const match = line.match(TASK_ITEM_REGEX);
      if (!match) {
        return rawLine;
      }

      current += 1;
      if (current !== index) {
        return rawLine;
      }

      const nextMark = match[2].toLowerCase() === "x" ? " " : "x";
      const updatedLine = line.replace(TASK_ITEM_REGEX, `${match[1]}${nextMark}${match[3]}`);
      changed = true;
      return `${updatedLine}${hasCarriage ? "\r" : ""}`;
    });

    return changed ? nextLines.join("\n") : source;
  };

  const loadNote = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/notes/${id}`);
      setNote(data);
      setTitle(data.title || "");
      setContent(data.content);
      setShortTitle(data.short_title || "");
      setCategory(data.ai_category || "");
      setTags((data.ai_tags || []).join(", "));
      setFolder(data.folder || "");
      return true;
    } catch (err) {
      setError(err.message || t("errors.loadNote"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loadRelated = async () => {
    setRelatedLoading(true);
    setRelatedError("");
    setRelatedNotes([]);
    setRelatedMode("");
    try {
      const params = new URLSearchParams({
        limit: "6",
        include_completed: showCompleted ? "true" : "false",
      });
      const data = await apiFetch(`/notes/${id}/related?${params.toString()}`);
      setRelatedNotes(data.items || []);
      setRelatedMode(data.mode || "");
    } catch (err) {
      setRelatedError(err.message || t("errors.loadRelated"));
    } finally {
      setRelatedLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      const ok = await loadNote();
      if (!active) return;
      if (ok) {
        await loadRelated();
      } else {
        setRelatedNotes([]);
        setRelatedMode("");
        setRelatedLoading(false);
      }
    };
    loadAll();
    return () => {
      active = false;
    };
  }, [id, showCompleted]);

  const handleToggleCompleted = async () => {
    if (!note) return;
    setError("");
    try {
      const data = await apiFetch(`/notes/${id}`, {
        method: "PUT",
        body: {
          completed: !note.completed,
          reanalyze: false,
        },
      });
      setNote(data);
      await loadRelated();
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    }
  };

  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const textarea = contentRef.current;
    if (!textarea) return;
    requestAnimationFrame(() => resizeTextareaToFit(textarea));
  }, [editing, content]);

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const trimmedTitle = title.trim();
      const tagsList = tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      const data = await apiFetch(`/notes/${id}`, {
        method: "PUT",
        body: {
          content,
          title: trimmedTitle || undefined,
          short_title: shortTitle.trim() || undefined,
          category: category || undefined,
          tags: tagsList,
          folder: folder.trim() || undefined,
          reanalyze: true,
        },
      });
      setNote(data);
      setTitle(data.title || "");
      setShortTitle(data.short_title || "");
      setCategory(data.ai_category || "");
      setTags((data.ai_tags || []).join(", "));
      setFolder(data.folder || "");
      setEditing(false);
      await loadRelated();
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleQuickRemoveTag = async (tagToRemove) => {
    if (!tagToRemove || !note || tagSaving) return;
    const confirmed = window.confirm(t("note.removeTagConfirm", { tag: tagToRemove }));
    if (!confirmed) return;

    const currentContent = note.content || content;
    if (!currentContent) {
      setError(t("errors.updateFailed"));
      return;
    }

    setTagSaving(true);
    setError("");
    try {
      const nextTags = (note.ai_tags || []).filter((tag) => tag !== tagToRemove);
      const data = await apiFetch(`/notes/${id}`, {
        method: "PUT",
        body: {
          content: currentContent,
          tags: nextTags,
          reanalyze: false,
        },
      });
      setNote(data);
      setTags((data.ai_tags || []).join(", "));
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    } finally {
      setTagSaving(false);
    }
  };

  const handleToggleTask = async (index) => {
    if (taskSaving || !note) return;
    const nextContent = toggleTaskAtIndex(note.content || "", index);
    if (nextContent === note.content) return;
    setTaskSaving(true);
    try {
      const data = await apiFetch(`/notes/${id}`, {
        method: "PUT",
        body: {
          content: nextContent,
          reanalyze: false,
        },
      });
      setNote(data);
      setContent(data.content);
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    } finally {
      setTaskSaving(false);
    }
  };

  const handleToggleRelatedComplete = async (relatedNote) => {
    if (!relatedNote) return;
    setRelatedError("");
    try {
      const nextCompleted = !relatedNote.completed;
      const data = await apiFetch(`/notes/${relatedNote.id}`, {
        method: "PUT",
        body: {
          completed: nextCompleted,
          reanalyze: false,
        },
      });
      setRelatedNotes((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      );
    } catch (err) {
      setRelatedError(err.message || t("errors.updateFailed"));
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(t("note.deleteConfirm"));
    if (!confirmed) return;
    try {
      await apiFetch(`/notes/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    }
  };

  const handleBack = () => {
    const from = location.state?.from;
    const folderActiveId = location.state?.folderActiveId;
    if (from) {
      navigate(from, folderActiveId ? { state: { folderActiveId } } : undefined);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
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

  const handleContentKeyDown = (event) => {
    if (handleNumberedListEnter(event, content, setContent)) {
      return;
    }
  };

  const insertAtCursor = (text) => {
    const target = contentRef.current;
    if (!target || typeof target.selectionStart !== "number") {
      setContent((prev) => `${prev}${text}`);
      return;
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
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const attachment = await uploadAttachment(file, Number(id));
      const isImage = (attachment.mime_type || "").startsWith("image/");
      const markdown = isImage
        ? `![${attachment.filename}](${attachment.url})`
        : `[${attachment.filename}](${attachment.url})`;
      insertAtCursor(markdown);
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

  const handleInsertNumbered = () => {
    const target = contentRef.current;
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
          const stripped = line.replace(/^\s*\d+\.\s+/, "").replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "").replace(/^\s*[-*+]\s+/, "");
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
    const target = contentRef.current;
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

  const handleInsertHighlight = () => {
    const target = contentRef.current;
    if (!target || typeof target.selectionStart !== "number") return;
    const { selectionStart, selectionEnd } = target;
    const wrapper = "==";
    const isEscapedAt = (value, index) => {
      if (index <= 0) return false;
      let count = 0;
      for (let i = index - 1; i >= 0 && value[i] === "\\"; i -= 1) {
        count += 1;
      }
      return count % 2 === 1;
    };

    if (selectionStart !== selectionEnd) {
      const selectedText = content.slice(selectionStart, selectionEnd);
      const hasOuterWrapper =
        selectionStart >= 2 &&
        selectionEnd + 2 <= content.length &&
        content.slice(selectionStart - 2, selectionStart) === wrapper &&
        content.slice(selectionEnd, selectionEnd + 2) === wrapper &&
        !isEscapedAt(content, selectionStart - 2) &&
        !isEscapedAt(content, selectionEnd);

      if (hasOuterWrapper) {
        const nextValue = `${content.slice(0, selectionStart - 2)}${selectedText}${content.slice(
          selectionEnd + 2
        )}`;
        setContent(nextValue);
        requestAnimationFrame(() => {
          target.focus();
          target.selectionStart = selectionStart - 2;
          target.selectionEnd = selectionEnd - 2;
        });
        return;
      }

      if (selectedText.includes("\n")) {
        const lines = selectedText.split("\n");
        const allWrapped = lines.every(
          (line) => !line || (line.startsWith(wrapper) && line.endsWith(wrapper) && line.length > 4)
        );
        const nextBlock = lines
          .map((line) => {
            if (!line) return line;
            if (allWrapped) {
              return line.slice(2, -2);
            }
            return `${wrapper}${line}${wrapper}`;
          })
          .join("\n");
        const nextValue = `${content.slice(0, selectionStart)}${nextBlock}${content.slice(
          selectionEnd
        )}`;
        setContent(nextValue);
        requestAnimationFrame(() => {
          target.focus();
          target.selectionStart = selectionStart;
          target.selectionEnd = selectionStart + nextBlock.length;
        });
        return;
      }

      const hasInnerWrapper =
        selectedText.startsWith(wrapper) &&
        selectedText.endsWith(wrapper) &&
        selectedText.length > 4 &&
        !isEscapedAt(selectedText, 0) &&
        !isEscapedAt(selectedText, selectedText.length - 2);

      if (hasInnerWrapper) {
        const unwrapped = selectedText.slice(2, -2);
        const nextValue = `${content.slice(0, selectionStart)}${unwrapped}${content.slice(
          selectionEnd
        )}`;
        setContent(nextValue);
        requestAnimationFrame(() => {
          target.focus();
          target.selectionStart = selectionStart;
          target.selectionEnd = selectionStart + unwrapped.length;
        });
        return;
      }

      const insertText = `${wrapper}${selectedText}${wrapper}`;
      const nextValue = `${content.slice(0, selectionStart)}${insertText}${content.slice(
        selectionEnd
      )}`;
      setContent(nextValue);
      requestAnimationFrame(() => {
        target.focus();
        target.selectionStart = selectionStart + wrapper.length;
        target.selectionEnd = selectionEnd + wrapper.length;
      });
      return;
    }

    const lineStart = content.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = content.indexOf("\n", selectionStart);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const line = content.slice(lineStart, lineEnd);
    const cursorInLine = selectionStart - lineStart;
    const findLeftWrapper = (fromIndex) => {
      let idx = line.lastIndexOf(wrapper, fromIndex);
      while (idx !== -1 && isEscapedAt(line, idx)) {
        idx = line.lastIndexOf(wrapper, idx - 1);
      }
      return idx;
    };
    const findRightWrapper = (fromIndex) => {
      let idx = line.indexOf(wrapper, fromIndex);
      while (idx !== -1 && isEscapedAt(line, idx)) {
        idx = line.indexOf(wrapper, idx + 1);
      }
      return idx;
    };
    const left = findLeftWrapper(cursorInLine - 1);
    const right = findRightWrapper(cursorInLine);

    if (left !== -1 && right !== -1 && left < cursorInLine && right >= cursorInLine) {
      const beforeLine = line.slice(0, left);
      const inner = line.slice(left + 2, right);
      const afterLine = line.slice(right + 2);
      const nextLine = `${beforeLine}${inner}${afterLine}`;
      const nextValue = `${content.slice(0, lineStart)}${nextLine}${content.slice(lineEnd)}`;
      setContent(nextValue);
      const cursor = Math.max(selectionStart - 2, lineStart);
      requestAnimationFrame(() => {
        target.focus();
        target.selectionStart = cursor;
        target.selectionEnd = cursor;
      });
      return;
    }

    const insertText = `${wrapper}${wrapper}`;
    const nextValue = `${content.slice(0, selectionStart)}${insertText}${content.slice(
      selectionEnd
    )}`;
    setContent(nextValue);
    const cursor = selectionStart + wrapper.length;
    requestAnimationFrame(() => {
      target.focus();
      target.selectionStart = cursor;
      target.selectionEnd = cursor;
    });
  };

  const handleShare = async () => {
    setError("");
    try {
      const data = await apiFetch("/shares", {
        method: "POST",
        body: { note_id: Number(id), expires_in_days: 7 },
      });
      setShareLink(`${window.location.origin}/share/${data.share_token}`);
    } catch (err) {
      setError(err.message || t("errors.shareFailed"));
    }
  };

  const displayContent = useMemo(() => {
    if (!note) return "";
    return note.content || "";
  }, [note]);

  const displaySummary = useMemo(() => {
    if (!note) return "";
    return note.ai_summary || "";
  }, [note]);

  const displayShortTitle = useMemo(() => {
    if (!note) return "";
    return note.short_title || "";
  }, [note]);

  const categoryLabel = useMemo(() => {
    if (!note) return "";
    return (
      settings?.categoryLabels?.[note.ai_category] ||
      formatCategoryLabel(note.ai_category || "idea")
    );
  }, [note, settings, formatCategoryLabel]);

  const relatedModeLabel = useMemo(() => {
    if (!relatedMode) return "";
    if (relatedMode === "semantic") {
      return t("note.relatedModeAi");
    }
    if (relatedMode === "keyword") {
      return t("note.relatedModeClassic");
    }
    return relatedMode;
  }, [relatedMode, t]);

  if (loading) {
    return <div className="empty-state">{t("note.loading")}</div>;
  }

  if (!note) {
    return <div className="empty-state">{t("note.notFound")}</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-main">
          <button 
            type="button" 
            onClick={handleBack}
            title={t("common.back")}
            aria-label={t("common.back")}
            style={{ 
              padding: "8px", 
              width: "40px", 
              height: "40px", 
              borderRadius: "999px", 
              display: "inline-flex", 
              alignItems: "center", 
              justifyContent: "center",
              marginBottom: "8px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              opacity: 0.6,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "0.6")}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="page-title note-detail-title">
            {note.title || t("common.untitledNote")}
          </div>
          <div className="page-subtitle note-detail-subtitle">
            {note.ai_summary || ""}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={handleToggleCompleted}>
            {note.completed ? t("note.markActive") : t("note.markCompleted")}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleShare}>
            {t("note.shareLink")}
          </button>
          <button className="btn btn-outline" type="button" onClick={handleDelete}>
            {t("common.delete")}
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {shareLink ? (
        <div className="card">
          <div className="card-title">{t("note.shareLink")}</div>
          <div className="input-row">
            <input value={shareLink} readOnly />
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareLink)}
            >
              {t("common.copy")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card note-detail" ref={detailRef}>
        <div className="section">
          <div className="summary-block">
            <div className="section-title">{t("note.aiSummary")}</div>
            <div className={displaySummary ? "note-summary" : "muted"}>
              {displaySummary || t("common.notGenerated")}
            </div>
          </div>
          {editing ? (
            <>
              <input
                type="text"
                placeholder={t("home.titlePlaceholder")}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea
                ref={contentRef}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  resizeTextareaToFit(event.target);
                }}
                onInput={(event) => resizeTextareaToFit(event.target)}
                onKeyDown={handleContentKeyDown}
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
                  onClick={handleInsertHighlight}
                  aria-label="Insert highlight"
                >
                  {t("editor.highlight")}
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
              <div className="note-action-row">
                <button className="btn" type="button" onClick={handleUpdate} disabled={saving}>
                  {saving ? t("common.saving") : t("common.save")}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <MarkdownContent
                content={displayContent}
                onToggleTask={taskSaving ? undefined : handleToggleTask}
              />
              <button className="btn btn-outline" type="button" onClick={() => setEditing(true)}>
                {t("note.edit")}
              </button>
            </>
          )}
        </div>
        <div className="meta-grid">
          <div>
            <div className="meta-label">{t("common.category")}</div>
            {editing ? (
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(settings?.categories || []).map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            ) : (
              <div>{categoryLabel}</div>
            )}
          </div>
          <div>
            <div className="meta-label">{t("note.folder")}</div>
            {editing ? (
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={t("note.folderPlaceholder")}
              />
            ) : (
              <div className={note.folder ? "" : "muted"}>
                {note.folder || t("common.notSet")}
              </div>
            )}
          </div>
          <div>
            <div className="meta-label">{t("note.shortTitle")}</div>
            {editing ? (
              <input
                value={shortTitle}
                onChange={(e) => setShortTitle(e.target.value)}
                placeholder={t("note.shortTitle")}
              />
            ) : (
              <div className={displayShortTitle ? "" : "muted"}>
                {displayShortTitle || t("common.notGenerated")}
              </div>
            )}
          </div>
          <div>
            <div className="meta-label">{t("note.sensitivity")}</div>
            <div>{formatSensitivity(note.ai_sensitivity || "low")}</div>
          </div>
          <div>
            <div className="meta-label">{t("note.created")}</div>
            <div>{note.created_at.slice(0, 19).replace("T", " ")}</div>
          </div>
          <div>
            <div className="meta-label">{t("note.tags")}</div>
            {editing ? (
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags (comma separated)"
              />
            ) : (
              <div className="tag-row">
                {(note.ai_tags || []).map((tag) => (
                  <span key={tag} className="tag-chip">
                    <Link
                      className="tag tag-link tag-chip-link"
                      to={`/tags?tag=${encodeURIComponent(tag)}`}
                    >
                      {tag}
                    </Link>
                    <button
                      className="tag-chip-remove"
                      type="button"
                      onClick={() => handleQuickRemoveTag(tag)}
                      disabled={tagSaving}
                      aria-label={t("note.removeTag", { tag })}
                      title={t("note.removeTag", { tag })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="meta-label">{t("note.entities")}</div>
            <pre className="muted">
              {JSON.stringify(note.ai_entities || {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("note.relatedTitle")}</div>
          {relatedModeLabel ? <span className="badge">{relatedModeLabel}</span> : null}
        </div>
        {relatedError ? <div className="error">{relatedError}</div> : null}
        {relatedLoading ? (
          <div className="empty-state">{t("note.relatedLoading")}</div>
        ) : relatedNotes.length === 0 ? (
          <div className="empty-state">{t("note.relatedEmpty")}</div>
        ) : (
          <div className="note-grid">
            {relatedNotes.map((relatedNote, index) => (
              <NoteCard key={relatedNote.id} note={relatedNote} index={index} onToggleComplete={handleToggleRelatedComplete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
