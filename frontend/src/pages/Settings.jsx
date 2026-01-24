import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";

export default function Settings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const settings = useSettings();
  const categories = settings?.categories || [];
  const defaultCategories = settings?.defaultCategories || [];
  const aiEnabled = settings?.aiEnabled ?? false;
  const showCompleted = settings?.showCompleted ?? false;
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState("");
  const [rebuildResult, setRebuildResult] = useState(null);
  const [reanalyze, setReanalyze] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState(() =>
    categories.map((category) => ({ ...category }))
  );
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [categoryNotice, setCategoryNotice] = useState("");

  useEffect(() => {
    setCategoryDraft(categories.map((category) => ({ ...category })));
  }, [categories]);

  useEffect(() => {
    if (!aiEnabled) {
      setReanalyze(false);
    }
  }, [aiEnabled]);

  const handleAiToggle = async (event) => {
    const nextEnabled = event.target.checked;
    setAiError("");
    if (!settings?.saveAiEnabled) {
      setAiError(t("errors.settingsUnavailable"));
      return;
    }
    setAiSaving(true);
    const result = await settings.saveAiEnabled(nextEnabled);
    if (!result.ok) {
      setAiError(result.error);
    }
    setAiSaving(false);
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: "1",
        page_size: "100",
        include_content: "true",
        include_completed: showCompleted ? "true" : "false",
      });
      const data = await apiFetch(`/notes?${params.toString()}`);
      const blob = new Blob([JSON.stringify(data.items, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "notemind-export.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || t("errors.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildError("");
    setRebuildResult(null);
    try {
      const batchSize = reanalyze ? 10 : 50;
      let cursor = null;
      let updated = 0;
      let failed = 0;
      let total = 0;
      while (true) {
        const data = await apiFetch("/notes/rebuild-embeddings", {
          method: "POST",
          body: { reanalyze, batch_size: batchSize, cursor },
        });
        total = Number.isFinite(data.total) ? data.total : total;
        updated += data.updated || 0;
        failed += data.failed || 0;
        setRebuildResult({ updated, failed, total });
        if (!data.next_cursor || data.next_cursor === cursor) {
          break;
        }
        cursor = data.next_cursor;
      }
    } catch (err) {
      setRebuildError(err.message || t("errors.rebuildFailed"));
    } finally {
      setRebuilding(false);
    }
  };

  const handleCategoryChange = (index, field, value) => {
    setCategoryNotice("");
    setCategoryDraft((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleAddCategory = () => {
    setCategoryNotice("");
    setCategoryDraft((prev) => [...prev, { key: "", label: "" }]);
  };

  const handleRemoveCategory = (index) => {
    setCategoryNotice("");
    setCategoryDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleResetCategories = () => {
    setCategoryDraft(defaultCategories.map((category) => ({ ...category })));
    setCategoryError("");
    setCategoryNotice("");
  };

  const buildCategoryPayload = () => {
    const trimmed = categoryDraft
      .map((item) => ({
        key: String(item.key || "").trim(),
        label: String(item.label || "").trim(),
      }))
      .filter((item) => item.key || item.label);
    const seen = new Set();
    const errors = [];
    const normalized = [];
    trimmed.forEach((item) => {
      if (!item.key) {
        errors.push(t("errors.categoryKeyRequired"));
        return;
      }
      const key = item.key.toLowerCase();
      if (seen.has(key)) {
        errors.push(t("errors.duplicateKey", { key }));
        return;
      }
      const label = item.label || item.key;
      normalized.push({ key, label });
      seen.add(key);
    });
    return { categories: normalized, errors };
  };

  const handleSaveCategories = async () => {
    setCategoryError("");
    setCategoryNotice("");
    const payload = buildCategoryPayload();
    if (payload.errors.length) {
      setCategoryError(payload.errors[0]);
      return;
    }
    if (!settings?.saveCategories) {
      setCategoryError(t("errors.settingsUnavailable"));
      return;
    }
    setCategorySaving(true);
    const result = await settings.saveCategories(payload.categories);
    if (result.ok) {
      setCategoryDraft(result.categories.map((category) => ({ ...category })));
      setCategoryNotice(t("errors.categoriesSaved"));
    } else {
      setCategoryError(result.error);
    }
    setCategorySaving(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("settings.title")}</div>
          <div className="page-subtitle">{t("settings.subtitle")}</div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.profile")}</div>
        </div>
        <div className="section">
          <div className="muted">{t("settings.username")}</div>
          <div>{user?.username}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.dataExport")}</div>
        </div>
        <p className="muted">
          {t("settings.dataExportDesc")}
        </p>
        <button className="btn btn-outline" type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? t("settings.exporting") : t("settings.exportButton")}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.aiFeatures")}</div>
        </div>
        <p className="muted">{t("settings.aiDesc")}</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={handleAiToggle}
            disabled={aiSaving}
          />
          {t("settings.aiToggle")}
        </label>
        {aiError ? <div className="error">{aiError}</div> : null}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.categories")}</div>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={handleResetCategories}>
              {t("settings.resetDefaults")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={handleSaveCategories}
              disabled={categorySaving}
            >
              {categorySaving ? t("common.saving") : t("settings.saveCategories")}
            </button>
          </div>
        </div>
        <p className="muted">
          {t("settings.categoriesDesc")}
        </p>
        <div className="category-list">
          {categoryDraft.map((category, index) => (
            <div className="category-row" key={index}>
              <input
                type="text"
                placeholder={t("settings.categoryLabel")}
                value={category.label}
                onChange={(event) => handleCategoryChange(index, "label", event.target.value)}
              />
              <input
                type="text"
                placeholder={t("settings.categoryKey")}
                value={category.key}
                onChange={(event) => handleCategoryChange(index, "key", event.target.value)}
              />
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => handleRemoveCategory(index)}
              >
                {t("settings.remove")}
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={handleAddCategory}>
            {t("settings.addCategory")}
          </button>
        </div>
        {settings?.error ? <div className="error">{settings.error}</div> : null}
        {categoryError ? <div className="error">{categoryError}</div> : null}
        {categoryNotice ? <div className="muted">{categoryNotice}</div> : null}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("settings.searchIndex")}</div>
        </div>
        <p className="muted">
          {t("settings.searchIndexDesc")}
        </p>
        <div className="section">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={reanalyze}
              onChange={(event) => setReanalyze(event.target.checked)}
              disabled={!aiEnabled || rebuilding}
            />
            {t("settings.reanalyze")}
          </label>
          <button
            className="btn"
            type="button"
            onClick={handleRebuild}
            disabled={!aiEnabled || rebuilding}
          >
            {rebuilding ? t("settings.rebuilding") : t("settings.rebuild")}
          </button>
          {!aiEnabled ? (
            <div className="muted">{t("settings.aiDisabled")}</div>
          ) : null}
          {rebuildError ? <div className="error">{rebuildError}</div> : null}
          {rebuildResult ? (
            <div className="muted">
              {t("settings.rebuildResult", {
                updated: rebuildResult.updated,
                total: rebuildResult.total,
                failed: rebuildResult.failed,
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
