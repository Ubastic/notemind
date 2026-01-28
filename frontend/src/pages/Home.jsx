import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiFetch, getNotesTimeline, listNotes, uploadAttachment, updateNote } from "../api";
import MarkdownContent from "../components/MarkdownContent";
import NoteCard from "../components/NoteCard";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

const formatDate = (iso) => {
  if (!iso) return "";
  return iso.slice(0, 10);
};

const pad2 = (value) => String(value).padStart(2, "0");

const getMonthRange = (monthKey) => {
  if (!monthKey || !monthKey.includes("-")) {
    return { start: null, end: null };
  }
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { start: null, end: null };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${yearRaw}-${pad2(month)}-01`;
  const end = `${yearRaw}-${pad2(month)}-${pad2(lastDay)}`;
  return { start, end };
};

export default function Home() {
  const { t, monthsShort, formatCategoryLabel } = useLanguage();
  const [monthTimeline, setMonthTimeline] = useState([]);
  const [loadedMonths, setLoadedMonths] = useState([]);
  const [monthNotes, setMonthNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [search, setSearch] = useState("");
  const [activeDate, setActiveDate] = useState("");
  const [railMode, setRailMode] = useState("day");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [railProgress, setRailProgress] = useState(0);
  const [railThumbY, setRailThumbY] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [railVisible, setRailVisible] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(true);
  const [overlayNote, setOverlayNote] = useState(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMetrics, setOverlayMetrics] = useState(null);
  const navigate = useNavigate();
  const captureRef = useRef(null);
  const searchRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const sectionRefs = useRef({});
  const timelineListRef = useRef(null);
  const monthListRef = useRef(null);
  const railRef = useRef(null);
  const scrubThumbRef = useRef(null);
  const scrubRafRef = useRef(null);
  const scrubYRef = useRef(0);
  const scrollTimeoutRef = useRef(null);
  const overlayCloseTimeoutRef = useRef(null);
  const railTouchRef = useRef({
    startX: 0,
    startY: 0,
    scrubbing: false,
  });
  const infiniteRef = useRef(null);
  const monthNotesRef = useRef({});
  const scrubStateRef = useRef({
    active: false,
    rafId: null,
    y: 0,
    lastKey: "",
    longPressId: null,
    startX: 0,
    startY: 0,
    moved: false,
  });
  const settings = useSettings();
  const categories = settings?.categories || [];
  const aiEnabled = settings?.aiEnabled ?? false;
  const showCompleted = settings?.showCompleted ?? false;

  const resizeTextareaToFit = (textarea) => {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const PAGE_SIZE = 50;

  const flatNotes = useMemo(() => {
    const keys = Array.isArray(loadedMonths) ? loadedMonths : [];
    const acc = [];
    keys.forEach((key) => {
      const entry = monthNotes?.[key];
      if (entry?.items?.length) {
        acc.push(...entry.items);
      }
    });
    return acc;
  }, [loadedMonths, monthNotes]);

  const pinnedNotes = useMemo(() => {
    const pinned = flatNotes.filter((note) => Boolean(note?.pinned_global));
    pinned.sort((a, b) => {
      const aPinned = a?.pinned_at || a?.created_at || "";
      const bPinned = b?.pinned_at || b?.created_at || "";
      if (aPinned === bPinned) {
        const aCreated = a?.created_at || "";
        const bCreated = b?.created_at || "";
        return aCreated < bCreated ? 1 : -1;
      }
      return aPinned < bPinned ? 1 : -1;
    });
    return pinned;
  }, [flatNotes]);

  const unpinnedNotes = useMemo(
    () => flatNotes.filter((note) => !note?.pinned_global),
    [flatNotes]
  );

  const grouped = useMemo(() => {
    return unpinnedNotes.reduce((acc, note) => {
      const date = formatDate(note.created_at);
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(note);
      return acc;
    }, {});
  }, [unpinnedNotes]);

  const dates = useMemo(() => Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1)), [grouped]);
  const timelineItems = useMemo(() => {
    return dates.map((date) => {
      const [year, month, day] = date.split("-");
      return {
        date,
        year,
        month: monthsShort[Math.max(0, Number.parseInt(month, 10) - 1)],
        day,
        count: grouped[date]?.length || 0,
      };
    });
  }, [dates, grouped, monthsShort]);
  const hasPinned = pinnedNotes.length > 0;
  const hasUnpinned = dates.length > 0;

  const overlayTitle = overlayNote
    ? overlayNote.title || overlayNote.ai_summary || t("common.untitledNote")
    : "";
  const overlayContent = overlayNote
    ? overlayNote.content || overlayNote.ai_summary || overlayNote.short_title || overlayNote.title || ""
    : "";
  const overlayTags = overlayNote?.ai_tags || [];
  const overlayCategoryLabel = overlayNote
    ? formatCategoryLabel(overlayNote.ai_category || "idea")
    : "";
  const overlayCreated = overlayNote?.created_at
    ? overlayNote.created_at.slice(0, 19).replace("T", " ")
    : "";
  const overlayStyle = overlayMetrics
    ? {
        "--overlay-start-x": `${overlayMetrics.dx}px`,
        "--overlay-start-y": `${overlayMetrics.dy}px`,
        "--overlay-start-scale": `${overlayMetrics.scale}`,
        width: `${overlayMetrics.targetWidth}px`,
        height: `${overlayMetrics.targetHeight}px`,
      }
    : undefined;

  const activeIndex = useMemo(
    () => timelineItems.findIndex((item) => item.date === activeDate),
    [timelineItems, activeDate]
  );

  const timelineProgress = useMemo(() => {
    if (!timelineItems.length) return "0%";
    const index = activeIndex >= 0 ? activeIndex : 0;
    const denom = Math.max(1, timelineItems.length - 1);
    return `${(index / denom) * 100}%`;
  }, [activeIndex, timelineItems.length]);

  const activeMonthKey = useMemo(() => {
    if (activeDate && activeDate.length >= 7) {
      return activeDate.slice(0, 7);
    }
    return loadedMonths?.[0] || "";
  }, [activeDate, loadedMonths]);

  const loadMonthPage = useCallback(async (monthKey, nextPage = 1, { append = false } = {}) => {
    const range = getMonthRange(monthKey);
    if (!range.start || !range.end) {
      return { items: [], total: 0 };
    }
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const data = await listNotes({
        page: nextPage,
        pageSize: PAGE_SIZE,
        includeContent: true,
        includeCompleted: showCompleted,
        timeStart: range.start,
        timeEnd: range.end,
      });
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number.isFinite(data.total) ? data.total : items.length;
      setMonthNotes((prev) => {
        const current = prev?.[monthKey] || { items: [], total: 0, page: 0 };
        const nextItems = append ? [...(current.items || []), ...items] : items;
        const nextState = {
          ...prev,
          [monthKey]: {
            ...current,
            items: nextItems,
            total,
            page: nextPage,
          },
        };
        monthNotesRef.current = nextState;
        return nextState;
      });
      return { items, total };
    } catch (err) {
      setError(err.message || t("errors.loadNotes"));
      return { items: [], total: 0 };
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [showCompleted, t]);

  useEffect(() => {
    monthNotesRef.current = monthNotes || {};
  }, [monthNotes]);

  const ensureMonthLoaded = useCallback(async (monthKey) => {
    if (!monthKey) return;
    if (loadedMonths.includes(monthKey)) return;
    setLoadedMonths([monthKey]);
    setMonthNotes({});
    await loadMonthPage(monthKey, 1, { append: false });
  }, [loadMonthPage, loadedMonths]);

  const ensureDateLoaded = useCallback(async (dateKey) => {
    if (!dateKey) return;
    const monthKey = dateKey.slice(0, 7);
    await ensureMonthLoaded(monthKey);
    const hasDay = (items) =>
      Array.isArray(items) && items.some((note) => formatDate(note?.created_at) === dateKey);

    let entry = monthNotesRef.current?.[monthKey];
    if (!entry?.items?.length) {
      await loadMonthPage(monthKey, 1, { append: false });
      entry = monthNotesRef.current?.[monthKey];
    }
    if (hasDay(entry?.items)) return;

    const total = entry?.total || 0;
    const page = entry?.page || 1;
    if (!total || total <= (entry?.items?.length || 0)) return;

    const maxPage = Math.ceil(total / PAGE_SIZE);
    for (let next = page + 1; next <= maxPage; next += 1) {
      const res = await loadMonthPage(monthKey, next, { append: true });
      if (hasDay(res.items)) return;
    }
  }, [ensureMonthLoaded, loadMonthPage]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getNotesTimeline({ group: "month", includeCompleted: showCompleted });
      const items = Array.isArray(data.items) ? data.items : [];
      setMonthTimeline(items);
      const firstMonth = items?.[0]?.key || "";
      if (!firstMonth) {
        setLoadedMonths([]);
        setMonthNotes({});
        return;
      }
      setLoadedMonths([firstMonth]);
      await loadMonthPage(firstMonth, 1, { append: false });
    } catch (err) {
      setError(err.message || t("errors.loadNotes"));
    } finally {
      setLoading(false);
    }
  }, [loadMonthPage, showCompleted, t]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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
      setRailOpen(true);
      setRailVisible(false);
    } else {
      setCaptureOpen(false);
      setSearchOpen(false);
      setRailOpen(true);
      setRailVisible(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const handler = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCaptureOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => captureRef.current?.focus(), 100);
          }
          return next;
        });
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => searchRef.current?.focus(), 100);
          }
          return next;
        });
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

  useEffect(() => {
    if (!scrubbing) return;
    return () => {
      if (scrubRafRef.current != null) {
        cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
    };
  }, [scrubbing]);

  const getScrubBounds = useCallback(() => {
    if (isMobile && typeof window !== "undefined") {
      const top = window.innerHeight * 0.4;
      const bottom = window.innerHeight * 0.8;
      if (bottom <= top) return null;
      return { top, bottom };
    }
    const railEl = railRef.current;
    if (!railEl) return null;
    const columnEl = railEl.querySelector(".timeline-column.day");
    const rect = (columnEl || railEl).getBoundingClientRect();
    const padding = 10;
    const top = rect.top + padding;
    const bottom = rect.bottom - padding;
    if (bottom <= top) return null;
    return { top, bottom };
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = null;
    const updateProgress = () => {
      if (scrubbing) return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      setRailProgress(progress);
      const bounds = getScrubBounds();
      if (!bounds) return;
      const y = bounds.top + (bounds.bottom - bounds.top) * progress;
      setRailThumbY(y);
    };
    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateProgress();
        if (isMobile) {
          setRailVisible(true);
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          if (!scrubbing) {
            scrollTimeoutRef.current = setTimeout(() => {
              setRailVisible(false);
            }, 1200);
          }
        }
      });
    };
    updateProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [getScrubBounds, scrubbing, isMobile]);

  useEffect(() => {
    if (!dates.length) {
      setActiveDate("");
      return;
    }
    const updateActive = () => {
      const anchor = window.innerHeight * 0.25;
      let nextDate = "";
      let closest = Number.POSITIVE_INFINITY;
      dates.forEach((date) => {
        const el = sectionRefs.current[date];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom <= 0) return;
        const distance = Math.abs(rect.top - anchor);
        if (distance < closest) {
          closest = distance;
          nextDate = date;
        }
      });
      if (nextDate) {
        setActiveDate((prev) => (prev === nextDate ? prev : nextDate));
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
  }, [dates]);

  const handleJump = useCallback(async (date, behavior = "smooth") => {
    await ensureDateLoaded(date);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const target = sectionRefs.current[date];
    if (target) {
      target.scrollIntoView({ behavior, block: "start" });
    }
  }, [ensureDateLoaded]);

  const handleJumpMonth = useCallback(async (monthKey) => {
    if (!monthKey) return;
    await ensureMonthLoaded(monthKey);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const firstDay = dates.find((value) => value.startsWith(monthKey));
    if (firstDay) {
      handleJump(firstDay, "smooth");
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [dates, ensureMonthLoaded, handleJump]);

  const scrubToPosition = useCallback(
    (clientY) => {
      const bounds = getScrubBounds();
      if (!bounds) return;
      const clampedY = Math.max(bounds.top, Math.min(clientY, bounds.bottom));
      const progress = (clampedY - bounds.top) / (bounds.bottom - bounds.top);
      setRailProgress(progress);
      setRailThumbY(clampedY);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll > 0) {
        window.scrollTo({ top: maxScroll * progress, behavior: "auto" });
      }
    },
    [getScrubBounds]
  );

  const scheduleScrub = useCallback(
    (clientY) => {
      scrubYRef.current = clientY;
      if (scrubRafRef.current != null) return;
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = null;
        scrubToPosition(scrubYRef.current);
      });
    },
    [scrubToPosition]
  );

  useEffect(() => {
    if (!isMobile) return;
    const handleTouchStart = (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      const target = event.target;
      const thumbEl = scrubThumbRef.current;
      if (!thumbEl || !target || !thumbEl.contains(target)) return;
      const touch = event.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      railTouchRef.current = {
        startX,
        startY,
        scrubbing: true,
      };
      setRailVisible(true);
      setScrubbing(true);
      scheduleScrub(startY);
    };
    const handleTouchMove = (event) => {
      const state = railTouchRef.current;
      if (!state.scrubbing) return;
      if (!event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      event.preventDefault();
      scheduleScrub(touch.clientY);
    };
    const handleTouchEnd = () => {
      if (railTouchRef.current.scrubbing) {
        setScrubbing(false);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setRailVisible(false);
      }, 1200);
      railTouchRef.current = {
        startX: 0,
        startY: 0,
        scrubbing: false,
      };
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isMobile, scheduleScrub]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    if (!monthTimeline.length || !loadedMonths.length) return;
    const lastMonth = loadedMonths[loadedMonths.length - 1];
    const lastEntry = monthNotes?.[lastMonth] || { items: [], total: 0, page: 1 };
    if (lastEntry.items.length < lastEntry.total) {
      await loadMonthPage(lastMonth, (lastEntry.page || 1) + 1, { append: true });
      return;
    }
    const index = monthTimeline.findIndex((item) => item.key === lastMonth);
    const next = index >= 0 ? monthTimeline[index + 1] : null;
    const nextKey = next?.key || "";
    if (!nextKey || loadedMonths.includes(nextKey)) return;
    setLoadedMonths((prev) => [...prev, nextKey]);
    await loadMonthPage(nextKey, 1, { append: false });
  }, [loadMonthPage, loadedMonths, loading, loadingMore, monthNotes, monthTimeline]);

  useEffect(() => {
    const node = infiniteRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, rootMargin: "400px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (!categories.length) {
      setSelectedCategory("");
      return;
    }
    setSelectedCategory((prev) => {
      const stillValid = prev && categories.some((category) => category.key === prev);
      if (aiEnabled) {
        return stillValid ? prev : "";
      }
      return stillValid ? prev : categories[0].key;
    });
  }, [aiEnabled, categories]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError("");
    try {
      const trimmedTitle = title.trim();
      const payload = { content, title: trimmedTitle || undefined };
      if (selectedCategory) {
        payload.category = selectedCategory;
      }
      const note = await apiFetch(draftId ? `/notes/${draftId}` : "/notes", {
        method: draftId ? "PUT" : "POST",
        body: {
          ...payload,
          ...(draftId
            ? {
                reanalyze: true,
              }
            : {}),
        },
      });
      setTitle("");
      setContent("");
      setDraftId(null);
      await loadInitial();
    } catch (err) {
      setError(err.message || t("errors.saveNote"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCategory = async (note, nextCategory) => {
    if (!note) return false;
    setError("");
    try {
      const safeContent = typeof note.content === "string" ? note.content : " ";
      const data = await apiFetch(`/notes/${note.id}`, {
        method: "PUT",
        body: {
          content: safeContent,
          category: nextCategory || undefined,
          reanalyze: false,
        },
      });
      setMonthNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((monthKey) => {
          const entry = next[monthKey];
          if (!entry?.items?.length) return;
          let changed = false;
          const updatedItems = entry.items.map((item) => {
            if (item.id !== data.id) return item;
            changed = true;
            return { ...item, ...data };
          });
          if (changed) {
            next[monthKey] = {
              ...entry,
              items: updatedItems,
            };
          }
        });
        return next;
      });
      return true;
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
      return false;
    }
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
      setMonthNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((monthKey) => {
          const entry = next[monthKey];
          if (!entry?.items?.length) return;
          let changed = false;
          const updatedItems = entry.items.map((item) => {
            if (item.id !== data.id) return item;
            changed = true;
            return { ...item, ...data };
          });
          if (changed) {
            next[monthKey] = {
              ...entry,
              items: updatedItems,
            };
          }
        });
        return next;
      });
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
    }
  };

  const handleCloseOverlay = useCallback(() => {
    setOverlayOpen(false);
    if (overlayCloseTimeoutRef.current) {
      clearTimeout(overlayCloseTimeoutRef.current);
    }
    overlayCloseTimeoutRef.current = setTimeout(() => {
      setOverlayNote(null);
      setOverlayMetrics(null);
    }, 260);
  }, []);

  const handleOpenOverlay = useCallback((note, originEl) => {
    if (!note || !originEl || typeof window === "undefined") return;
    const rect = originEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth || rect.width;
    const viewportHeight = window.innerHeight || rect.height;
    const targetWidth = Math.min(viewportWidth * 0.8, 1100);
    const targetHeight = Math.min(viewportHeight * 0.8, 760);
    const targetLeft = (viewportWidth - targetWidth) / 2;
    const targetTop = (viewportHeight - targetHeight) / 2;
    const scaleX = rect.width / targetWidth;
    const scaleY = rect.height / targetHeight;
    const scale = Math.max(0.2, Math.min(scaleX, scaleY, 1));

    if (overlayCloseTimeoutRef.current) {
      clearTimeout(overlayCloseTimeoutRef.current);
      overlayCloseTimeoutRef.current = null;
    }
    setOverlayMetrics({
      targetWidth,
      targetHeight,
      dx: rect.left - targetLeft,
      dy: rect.top - targetTop,
      scale,
    });
    setOverlayNote(note);
    setOverlayOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOverlayOpen(true));
    });
  }, []);

  useEffect(() => {
    if (!overlayNote) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleCloseOverlay();
      }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [overlayNote, handleCloseOverlay]);

  useEffect(() => () => {
    if (overlayCloseTimeoutRef.current) {
      clearTimeout(overlayCloseTimeoutRef.current);
    }
  }, []);

  const handleTogglePin = async (note) => {
    if (!note) return;
    setError("");
    try {
      const nextPinnedGlobal = !note.pinned_global;
      const data = await updateNote(note.id, {
        pinned_global: nextPinnedGlobal,
        reanalyze: false,
      });
      setMonthNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((monthKey) => {
          const entry = next[monthKey];
          if (!entry?.items?.length) return;
          let changed = false;
          const updatedItems = entry.items.map((item) => {
            if (item.id !== data.id) return item;
            changed = true;
            return { ...item, ...data };
          });
          if (changed) {
            next[monthKey] = {
              ...entry,
              items: updatedItems,
            };
          }
        });
        return next;
      });
    } catch (err) {
      setError(err.message || t("errors.updateFailed"));
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
        const createPayload = {
          content: content.trim() ? content : " ",
          title: trimmedTitle || undefined,
          category: selectedCategory || undefined,
        };
        const note = await apiFetch("/notes", {
          method: "POST",
          body: createPayload,
        });
        noteId = note.id;
        setDraftId(noteId);
        await loadInitial();
      }

      const attachment = await uploadAttachment(file, noteId);
      const isImage = (attachment.mime_type || "").startsWith("image/");
      const markdown = isImage
        ? `![${attachment.filename}](${attachment.url})`
        : `[${attachment.filename}](${attachment.url})`;
      const nextContent = insertAtCursor(markdown);
      const trimmedTitle = title.trim();
      await apiFetch(`/notes/${noteId}`, {
        method: "PUT",
        body: {
          content: nextContent,
          reanalyze: false,
          title: trimmedTitle || undefined,
          category: selectedCategory || undefined,
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
    if (!search.trim()) return;
    navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  const handleDelete = async (noteId) => {
    setError("");
    try {
      await apiFetch(`/notes/${noteId}`, { method: "DELETE" });
      setMonthNotes((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((monthKey) => {
          const entry = next[monthKey];
          if (!entry?.items?.length) return;
          const filtered = entry.items.filter((note) => note.id !== noteId);
          next[monthKey] = {
            ...entry,
            items: filtered,
            total: Math.max(0, (entry.total || filtered.length) - 1),
          };
        });
        return next;
      });
    } catch (err) {
      setError(err.message || t("errors.deleteFailed"));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-content">
          <div className="page-title">{t("home.title")}</div>
          <div className="page-subtitle">{t("home.subtitle")}</div>
        </div>
        <div className="header-actions">
          <button
            className={`action-btn ${captureOpen ? "active" : ""}`}
            onClick={() => {
              setCaptureOpen(!captureOpen);
              if (!captureOpen) setTimeout(() => captureRef.current?.focus(), 100);
            }}
            title="Ctrl + K"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>{t("home.quickCapture")}</span>
          </button>
          <button
            className={`action-btn ${searchOpen ? "active" : ""}`}
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 100);
            }}
            title="Ctrl + F"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>{t("common.search")}</span>
          </button>
        </div>
      </div>
      <div className="timeline-layout dual">
        <div className="timeline-main">
          {error ? <div className="error">{error}</div> : null}

          {pinnedNotes.length ? (
            <div className="section pinned-section">
              <div className="section-title">{t("common.pinned")}</div>
              <div className="note-grid">
                {pinnedNotes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    index={index}
                    previewMode="timeline"
                    onOpenOverlay={handleOpenOverlay}
                    onDelete={() => handleDelete(note.id)}
                    enableCategoryEdit
                    onUpdateCategory={handleUpdateCategory}
                    onToggleComplete={handleToggleComplete}
                    onTogglePin={handleTogglePin}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {captureOpen && (
            <div className="card capture-card fade-in">
              <div className="section">
                <input
                  type="text"
                  placeholder={t("home.titlePlaceholder")}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <div className="category-picker">
                  <div className="muted">{t("common.category")}</div>
                  <div
                    className="category-options"
                    role="radiogroup"
                    aria-label={t("common.category")}
                  >
                    {aiEnabled ? (
                      <label
                        className={`category-option ${
                          selectedCategory === "" ? "active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="timeline-category"
                          value=""
                          checked={selectedCategory === ""}
                          onChange={() => setSelectedCategory("")}
                        />
                        <span>{t("home.aiDecide")}</span>
                      </label>
                    ) : null}
                    {categories.map((category) => (
                      <label
                        key={category.key}
                        className={`category-option ${
                          selectedCategory === category.key ? "active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="timeline-category"
                          value={category.key}
                          checked={selectedCategory === category.key}
                          onChange={() => setSelectedCategory(category.key)}
                        />
                        <span>{category.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={captureRef}
                  placeholder={t("home.capturePlaceholder")}
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
          )}

          {searchOpen && (
            <div className="card search-card fade-in">
              <div className="quick-actions">
                <div className="section">
                  <form onSubmit={handleSearch} className="section">
                    <input
                      ref={searchRef}
                      type="text"
                      placeholder={t("home.searchPlaceholder")}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <button className="btn btn-outline" type="submit">
                      {t("common.search")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="empty-state">{t("home.loadingNotes")}</div>
          ) : !hasUnpinned ? (
            hasPinned ? null : <div className="empty-state">{t("home.emptyNotes")}</div>
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
                      onOpenOverlay={handleOpenOverlay}
                      onDelete={() => handleDelete(note.id)}
                      enableCategoryEdit
                      onUpdateCategory={handleUpdateCategory}
                      onToggleComplete={handleToggleComplete}
                      onTogglePin={handleTogglePin}
                      isMobile={isMobile}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
          <div ref={infiniteRef} style={{ height: "1px" }} />
          {loadingMore ? <div className="empty-state">{t("common.loading")}</div> : null}
        </div>

        <aside
          className={`timeline-rail dual mode-${railMode} ${railOpen ? "rail-open" : ""} ${railVisible ? "rail-visible" : ""}`}
          aria-label={t("nav.timeline")}
          ref={railRef}
        >
          {isMobile ? (
            <>
              <div className="timeline-scrub-track" aria-hidden="true">
                <div
                  className="timeline-scrub-thumb"
                  style={{ top: `${railThumbY}px` }}
                  ref={scrubThumbRef}
                >
                  {(scrubbing || railVisible) && activeDate && (
                    <div className="timeline-scrub-label">
                      <span className="timeline-scrub-day">
                        {activeDate.slice(8, 10)}
                      </span>
                      <span className="timeline-scrub-month">
                        {monthsShort[Math.max(0, Number.parseInt(activeDate.slice(5, 7), 10) - 1)] || activeDate.slice(5, 7)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="timeline-toggle">
                <button
                  className="timeline-toggle-btn"
                  type="button"
                  aria-pressed={railMode === "month"}
                  title={railMode === "day" ? t("common.day") : t("common.month")}
                  onClick={() => setRailMode((prev) => (prev === "day" ? "month" : "day"))}
                >
                  {t("common.day")}/{t("common.month")}
                </button>
              </div>
              <div className="timeline-column day" aria-label="Day">
                <div className="timeline-column-title">{t("common.day")}</div>
                <div className="timeline-list" ref={timelineListRef}>
                  <div className="timeline-progress" style={{ height: timelineProgress }} />
                  {timelineItems.map((item) => (
                    <button
                      key={item.date}
                      className={`timeline-item ${activeDate === item.date ? "active" : ""}`}
                      data-date={item.date}
                      type="button"
                      onClick={() => handleJump(item.date)}
                    >
                      <span className="timeline-dot" aria-hidden="true" />
                      <span className="timeline-date">
                        <span className="timeline-day">{item.day}</span>
                        <span className="timeline-month">{item.month}</span>
                      </span>
                      <span className="timeline-count">{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="timeline-column month" aria-label="Month">
                <div className="timeline-column-title">{t("common.month")}</div>
                <div className="timeline-list" ref={monthListRef}>
                  {monthTimeline.map((item) => {
                    const key = item.key;
                    const year = key.slice(0, 4);
                    const month = key.slice(5, 7);
                    const monthLabel =
                      monthsShort[Math.max(0, Number.parseInt(month, 10) - 1)] || month;
                    const active = activeMonthKey === key;
                    return (
                      <button
                        key={key}
                        className={`timeline-item ${active ? "active" : ""}`}
                        type="button"
                        onClick={() => handleJumpMonth(key)}
                      >
                        <span className="timeline-dot" aria-hidden="true" />
                        <span className="timeline-date">
                          <span className="timeline-day">{monthLabel}</span>
                          <span className="timeline-month">{year}</span>
                        </span>
                        <span className="timeline-count">{item.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {overlayNote ? (
        <div
          className={`note-overlay ${overlayOpen ? "open" : ""}`}
          role="dialog"
          aria-modal="true"
          onClick={handleCloseOverlay}
        >
          <div
            className="note-overlay-card"
            style={overlayStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="note-overlay-header">
              <div className="note-overlay-meta">
                <span className="badge">{overlayCategoryLabel}</span>
                {overlayNote.folder ? (
                  <span className="badge">{overlayNote.folder}</span>
                ) : null}
                {overlayCreated ? (
                  <span className="note-overlay-time">{overlayCreated}</span>
                ) : null}
              </div>
              <button
                className="note-overlay-close"
                type="button"
                onClick={handleCloseOverlay}
                aria-label={t("common.cancel")}
              >
                x
              </button>
            </div>
            <h2 className="note-overlay-title">{overlayTitle}</h2>
            <div className="note-overlay-content">
              <MarkdownContent content={overlayContent} />
            </div>
            <div className="note-overlay-footer">
              {overlayTags.length ? (
                <div className="tag-row note-overlay-tags">
                  {overlayTags.map((tag) => (
                    <Link
                      key={tag}
                      className="tag tag-link"
                      to={`/tags?tag=${encodeURIComponent(tag)}`}
                      onClick={handleCloseOverlay}
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="note-card-actions note-overlay-actions-bar">
                {typeof handleToggleComplete === "function" ? (
                  <button
                    className={`note-toggle-status ${overlayNote?.completed ? "completed" : ""}`}
                    type="button"
                    onClick={() => handleToggleComplete(overlayNote)}
                    title={overlayNote?.completed ? "Mark as in-progress" : "Mark as completed"}
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
                      {overlayNote?.completed ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="9" />
                      )}
                    </svg>
                  </button>
                ) : null}
                {typeof handleTogglePin === "function" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => handleTogglePin(overlayNote)}
                  >
                    {overlayNote?.pinned_global ? t("common.unpin") : t("common.pin")}
                  </button>
                ) : null}
                {typeof handleDelete === "function" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => handleDelete(overlayNote.id)}
                  >
                    {t("common.delete")}
                  </button>
                ) : null}
              </div>
              <div className="note-overlay-actions">
                <Link
                  className="btn btn-outline"
                  to={`/note/${overlayNote.id}`}
                  onClick={handleCloseOverlay}
                >
                  {t("note.openDetail")}
                </Link>
                <button className="btn" type="button" onClick={handleCloseOverlay}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
