import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "./AuthContext";

const DEFAULT_CATEGORIES = [
  { key: "credential", label: "Credentials" },
  { key: "work", label: "Work" },
  { key: "idea", label: "Ideas" },
  { key: "todo", label: "Todo" },
];

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
  const { token } = useAuth();
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    if (!token) {
      setCategories(DEFAULT_CATEGORIES);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/settings");
      const normalized = normalizeCategories(data.categories);
      setCategories(normalized.length ? normalized : DEFAULT_CATEGORIES);
    } catch (err) {
      setError(err.message || "Failed to load settings");
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveCategories = useCallback(
    async (nextCategories) => {
      if (!token) {
        return { ok: false, error: "Not authenticated" };
      }
      const normalized = normalizeCategories(nextCategories);
      try {
        const data = await apiFetch("/settings", {
          method: "PUT",
          body: { categories: normalized },
        });
        const resolved = normalizeCategories(data.categories);
        const finalCategories = resolved.length ? resolved : DEFAULT_CATEGORIES;
        setCategories(finalCategories);
        return { ok: true, categories: finalCategories };
      } catch (err) {
        return { ok: false, error: err.message || "Failed to save settings" };
      }
    },
    [token]
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
      loading,
      error,
      refreshSettings: loadSettings,
      saveCategories,
      defaultCategories: DEFAULT_CATEGORIES,
    }),
    [categories, categoryLabels, loading, error, loadSettings, saveCategories]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}

export { DEFAULT_CATEGORIES, normalizeCategories };
