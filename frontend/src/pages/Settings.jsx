import { useEffect, useState } from "react";

import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

export default function Settings() {
  const { user } = useAuth();
  const settings = useSettings();
  const categories = settings?.categories || [];
  const defaultCategories = settings?.defaultCategories || [];
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
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

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const data = await apiFetch("/notes?page=1&page_size=100&include_content=true");
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
      setError(err.message || "Export failed");
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
      setRebuildError(err.message || "Rebuild failed");
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
        errors.push("Every category needs a key or remove empty rows.");
        return;
      }
      const key = item.key.toLowerCase();
      if (seen.has(key)) {
        errors.push(`Duplicate key: ${key}.`);
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
      setCategoryError("Settings are not available yet.");
      return;
    }
    setCategorySaving(true);
    const result = await settings.saveCategories(payload.categories);
    if (result.ok) {
      setCategoryDraft(result.categories.map((category) => ({ ...category })));
      setCategoryNotice("Categories saved.");
    } else {
      setCategoryError(result.error);
    }
    setCategorySaving(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage data exports and preferences.</div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Profile</div>
        </div>
        <div className="section">
          <div className="muted">Username</div>
          <div>{user?.username}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Data export</div>
        </div>
        <p className="muted">
          Download a JSON file with your decrypted notes and metadata.
        </p>
        <button className="btn btn-outline" type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting..." : "Export JSON"}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Categories</div>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={handleResetCategories}>
              Reset defaults
            </button>
            <button
              className="btn"
              type="button"
              onClick={handleSaveCategories}
              disabled={categorySaving}
            >
              {categorySaving ? "Saving..." : "Save categories"}
            </button>
          </div>
        </div>
        <p className="muted">
          Customize the category tabs and AI classification. Leave empty to use the defaults.
        </p>
        <div className="category-list">
          {categoryDraft.map((category, index) => (
            <div className="category-row" key={`${category.key}-${index}`}>
              <input
                type="text"
                placeholder="Label"
                value={category.label}
                onChange={(event) => handleCategoryChange(index, "label", event.target.value)}
              />
              <input
                type="text"
                placeholder="Key (used in URL and AI)"
                value={category.key}
                onChange={(event) => handleCategoryChange(index, "key", event.target.value)}
              />
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => handleRemoveCategory(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={handleAddCategory}>
            Add category
          </button>
        </div>
        {settings?.error ? <div className="error">{settings.error}</div> : null}
        {categoryError ? <div className="error">{categoryError}</div> : null}
        {categoryNotice ? <div className="muted">{categoryNotice}</div> : null}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Semantic search index</div>
        </div>
        <p className="muted">
          Rebuild embeddings so semantic search can find older notes.
        </p>
        <div className="section">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={reanalyze}
              onChange={(event) => setReanalyze(event.target.checked)}
            />
            Reanalyze notes (slower, uses LLM)
          </label>
          <button className="btn" type="button" onClick={handleRebuild} disabled={rebuilding}>
            {rebuilding ? "Rebuilding..." : "Rebuild embeddings"}
          </button>
          {rebuildError ? <div className="error">{rebuildError}</div> : null}
          {rebuildResult ? (
            <div className="muted">
              Updated {rebuildResult.updated} / {rebuildResult.total} notes. Failed: {rebuildResult.failed}.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
