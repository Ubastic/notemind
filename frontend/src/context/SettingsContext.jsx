import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";

const DEFAULT_CATEGORIES = [
  { key: "credential", label: "Credentials" },
  { key: "work", label: "Work" },
  { key: "idea", label: "Ideas" },
  { key: "todo", label: "Todo" },
];

const SHOW_COMPLETED_KEY = "notemind_show_completed";

const getInitialShowCompleted = () => {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(SHOW_COMPLETED_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return false;
};

const SettingsContext = createContext(null);

const normalizeCategories = (categories) => {
  if (!Array.isArray(categories)) return [];
  const normalized = [];
  const seen = new Set();
  categories.forEach((item) => {
    if (!item) return;
    const rawKey = typeof item === "string" ? item : item.key;
    const rawLabel = typeof item === "string" ? item : item.label;
    const key = String(rawKey ?? "").trim().toLowerCase();
    const label = String(rawLabel ?? "").trim();
    if (!key || seen.has(key)) return;
    normalized.push({ key, label: label || key });
    seen.add(key);
  });
  return normalized;
};

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { t, defaultCategories: localeDefaultCategories } = useLanguage();
  const resolvedDefaultCategories = useMemo(() => {
    const base =
      Array.isArray(localeDefaultCategories) && localeDefaultCategories.length
        ? localeDefaultCategories
        : DEFAULT_CATEGORIES;
    return base.map((category) => ({ ...category }));
  }, [localeDefaultCategories]);
  const [categories, setCategories] = useState(resolvedDefaultCategories);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showCompleted, setShowCompleted] = useState(getInitialShowCompleted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SHOW_COMPLETED_KEY, showCompleted ? "true" : "false");
  }, [showCompleted]);

  const loadSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setCategories(resolvedDefaultCategories);
      setAiEnabled(false);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/settings");
      const normalized = normalizeCategories(data.categories);
      setCategories(normalized.length ? normalized : resolvedDefaultCategories);
      setAiEnabled(Boolean(data.ai_enabled));
    } catch (err) {
      setError(err.message || t("errors.loadSettings"));
      setCategories(resolvedDefaultCategories);
      setAiEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, resolvedDefaultCategories, t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCategories(resolvedDefaultCategories);
    }
  }, [resolvedDefaultCategories, isAuthenticated]);

  const saveCategories = useCallback(
    async (nextCategories) => {
      if (!isAuthenticated) {
        return { ok: false, error: t("errors.notAuthenticated") };
      }
      const normalized = normalizeCategories(nextCategories);
      try {
        const data = await apiFetch("/settings", {
          method: "PUT",
          body: { categories: normalized, ai_enabled: aiEnabled },
        });
        const resolved = normalizeCategories(data.categories);
        const finalCategories = resolved.length ? resolved : resolvedDefaultCategories;
        setCategories(finalCategories);
        setAiEnabled(Boolean(data.ai_enabled));
        return { ok: true, categories: finalCategories, aiEnabled: Boolean(data.ai_enabled) };
      } catch (err) {
        return { ok: false, error: err.message || t("errors.saveSettings") };
      }
    },
    [isAuthenticated, aiEnabled, resolvedDefaultCategories, t]
  );

  const saveAiEnabled = useCallback(
    async (nextEnabled) => {
      if (!isAuthenticated) {
        return { ok: false, error: t("errors.notAuthenticated") };
      }
      const normalized = normalizeCategories(categories);
      try {
        const data = await apiFetch("/settings", {
          method: "PUT",
          body: { categories: normalized, ai_enabled: Boolean(nextEnabled) },
        });
        const resolved = normalizeCategories(data.categories);
        const finalCategories = resolved.length ? resolved : resolvedDefaultCategories;
        if (JSON.stringify(finalCategories) !== JSON.stringify(categories)) {
          setCategories(finalCategories);
        }
        setAiEnabled(Boolean(data.ai_enabled));
        return {
          ok: true,
          categories: finalCategories,
          aiEnabled: Boolean(data.ai_enabled),
        };
      } catch (err) {
        return { ok: false, error: err.message || t("errors.saveSettings") };
      }
    },
    [isAuthenticated, categories, resolvedDefaultCategories, t]
  );

  const categoryLabels = useMemo(() => {
    const labels = {};
    categories.forEach((category) => {
      labels[category.key] = category.label;
    });
    return labels;
  }, [categories]);

  const value = useMemo(
    () => ({
      categories,
      categoryLabels,
      aiEnabled,
      showCompleted,
      setShowCompleted,
      loading,
      error,
      refreshSettings: loadSettings,
      saveCategories,
      saveAiEnabled,
      defaultCategories: resolvedDefaultCategories,
    }),
    [
      categories,
      categoryLabels,
      aiEnabled,
      showCompleted,
      loading,
      error,
      loadSettings,
      saveCategories,
      saveAiEnabled,
      resolvedDefaultCategories,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

export { DEFAULT_CATEGORIES, normalizeCategories };
