import { useEffect, useMemo, useRef, useState } from "react";

import { exportTracker, getTracker, importTracker, saveTracker } from "../api";
import { useLanguage } from "../context/LanguageContext";

const createId = (prefix = "id") =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const LEGACY_STORAGE_KEY = "notemind_tracker_v1";

const parseOptions = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const columnWidthMap = {
  auto: 72,
  text: 170,
  longtext: 260,
  date: 140,
  time: 120,
  select: 170,
  boolean: 100,
};

const getDefaultValueForType = (type) => {
  if (type === "boolean") return false;
  return "";
};

const getNextSeq = (rows) => rows.reduce((max, row) => Math.max(max, row.seq || 0), 0) + 1;

export default function Tracker() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [legacyState, setLegacyState] = useState(null);
  const [legacyPromptOpen, setLegacyPromptOpen] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const buildDefaultColumns = () => {
    const typeOptions = parseOptions(t("tracker.defaultTypeOptions"));
    const statusOptions = parseOptions(t("tracker.defaultStatusOptions"));
    return [
      { id: createId("col"), label: t("tracker.columns.seq"), type: "auto", locked: true },
      { id: createId("col"), label: t("tracker.columns.title"), type: "longtext" },
      { id: createId("col"), label: t("tracker.columns.type"), type: "select", options: typeOptions },
      { id: createId("col"), label: t("tracker.columns.requester"), type: "text" },
      { id: createId("col"), label: t("tracker.columns.reportDate"), type: "date" },
      { id: createId("col"), label: t("tracker.columns.reportTime"), type: "time" },
      { id: createId("col"), label: t("tracker.columns.targetDate"), type: "date" },
      { id: createId("col"), label: t("tracker.columns.owner"), type: "text" },
      { id: createId("col"), label: t("tracker.columns.status"), type: "select", options: statusOptions },
      { id: createId("col"), label: t("tracker.columns.done"), type: "boolean" },
      { id: createId("col"), label: t("tracker.columns.notes"), type: "text" },
    ];
  };

  const buildDefaultTable = (index = 1) => ({
    id: createId("table"),
    name:
      index > 1 ? `${t("tracker.defaultTableName")} ${index}` : t("tracker.defaultTableName"),
    columns: buildDefaultColumns(),
    rows: [],
  });

  const buildDefaultProject = (index = 1) => {
    const table = buildDefaultTable(1);
    return {
      id: createId("project"),
      name:
        index > 1 ? `${t("tracker.defaultProjectName")} ${index}` : t("tracker.defaultProjectName"),
      tables: [table],
    };
  };

  const buildDefaultState = () => {
    const project = buildDefaultProject(1);
    return {
      projects: [project],
      activeProjectId: project.id,
      activeTableId: project.tables[0].id,
    };
  };

  const [trackerState, setTrackerState] = useState(() => buildDefaultState());

  const projects = trackerState.projects || [];
  const activeProject = useMemo(
    () => projects.find((project) => project.id === trackerState.activeProjectId) || projects[0],
    [projects, trackerState.activeProjectId]
  );
  const activeTable = useMemo(() => {
    if (!activeProject) return null;
    return (
      activeProject.tables.find((table) => table.id === trackerState.activeTableId) ||
      activeProject.tables[0] ||
      null
    );
  }, [activeProject, trackerState.activeTableId]);

  useEffect(() => {
    let mounted = true;
    let legacyPayload = null;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
            legacyPayload = parsed;
          }
        } catch (err) {
          legacyPayload = null;
        }
      }
    }
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getTracker();
        if (!mounted) return;
        if (data && Array.isArray(data.projects) && data.projects.length) {
          setTrackerState(data);
          setLegacyPromptOpen(false);
        } else {
          setTrackerState(buildDefaultState());
          if (legacyPayload) {
            setLegacyState(legacyPayload);
            setLegacyPromptOpen(true);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || t("errors.loadTracker"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setHydrated(true);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      setSyncing(true);
      setSyncError("");
      try {
        await saveTracker(trackerState);
        setLastSavedAt(new Date());
      } catch (err) {
        setSyncError(err.message || t("errors.saveTracker"));
        setError(err.message || t("errors.saveTracker"));
      } finally {
        setSyncing(false);
      }
    }, 800);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [trackerState, hydrated, t]);

  useEffect(() => {
    setTrackerState((prev) => {
      if (!prev.projects || prev.projects.length === 0) {
        const project = buildDefaultProject(1);
        return {
          projects: [project],
          activeProjectId: project.id,
          activeTableId: project.tables[0].id,
        };
      }
      const resolvedProject =
        prev.projects.find((project) => project.id === prev.activeProjectId) || prev.projects[0];
      if (!resolvedProject) return prev;
      const resolvedTable =
        resolvedProject.tables.find((table) => table.id === prev.activeTableId) ||
        resolvedProject.tables[0];
      if (
        resolvedProject.id === prev.activeProjectId &&
        resolvedTable?.id === prev.activeTableId
      ) {
        return prev;
      }
      return {
        ...prev,
        activeProjectId: resolvedProject.id,
        activeTableId: resolvedTable?.id || "",
      };
    });
  }, [t, trackerState.projects]);

  const updateActiveProject = (updater) => {
    if (!activeProject) return;
    setTrackerState((prev) => {
      const projectsNext = prev.projects.map((project) =>
        project.id === activeProject.id ? updater(project) : project
      );
      return { ...prev, projects: projectsNext };
    });
  };

  const updateActiveTable = (updater) => {
    if (!activeProject || !activeTable) return;
    setTrackerState((prev) => {
      const projectsNext = prev.projects.map((project) => {
        if (project.id !== activeProject.id) return project;
        const tablesNext = project.tables.map((table) =>
          table.id === activeTable.id ? updater(table) : table
        );
        return { ...project, tables: tablesNext };
      });
      return { ...prev, projects: projectsNext };
    });
  };

  const handleAddProject = () => {
    setTrackerState((prev) => {
      const project = buildDefaultProject(prev.projects.length + 1);
      return {
        projects: [...prev.projects, project],
        activeProjectId: project.id,
        activeTableId: project.tables[0].id,
      };
    });
  };

  const handleDeleteProject = () => {
    if (!activeProject) return;
    if (!window.confirm(t("tracker.confirmDeleteProject", { name: activeProject.name }))) {
      return;
    }
    setTrackerState((prev) => {
      const projectsNext = prev.projects.filter((project) => project.id !== activeProject.id);
      if (!projectsNext.length) {
        const fallback = buildDefaultProject(1);
        return {
          projects: [fallback],
          activeProjectId: fallback.id,
          activeTableId: fallback.tables[0].id,
        };
      }
      const nextProject = projectsNext[0];
      return {
        ...prev,
        projects: projectsNext,
        activeProjectId: nextProject.id,
        activeTableId: nextProject.tables[0]?.id || "",
      };
    });
  };

  const handleAddTable = () => {
    if (!activeProject) return;
    const index = activeProject.tables.length + 1;
    const table = buildDefaultTable(index);
    setTrackerState((prev) => {
      const projectsNext = prev.projects.map((project) => {
        if (project.id !== activeProject.id) return project;
        return { ...project, tables: [...project.tables, table] };
      });
      return { ...prev, projects: projectsNext, activeTableId: table.id };
    });
  };

  const handleDeleteTable = () => {
    if (!activeProject || !activeTable) return;
    if (activeProject.tables.length <= 1) return;
    if (!window.confirm(t("tracker.confirmDeleteTable", { name: activeTable.name }))) {
      return;
    }
    setTrackerState((prev) => {
      const projectsNext = prev.projects.map((project) => {
        if (project.id !== activeProject.id) return project;
        return {
          ...project,
          tables: project.tables.filter((table) => table.id !== activeTable.id),
        };
      });
      const remainingTables =
        projectsNext.find((project) => project.id === activeProject.id)?.tables || [];
      const nextTableId = remainingTables[0]?.id || "";
      return { ...prev, projects: projectsNext, activeTableId: nextTableId };
    });
  };

  const handleProjectNameChange = (value) => {
    updateActiveProject((project) => ({ ...project, name: value }));
  };

  const handleTableNameChange = (value) => {
    updateActiveTable((table) => ({ ...table, name: value }));
  };

  const handleSelectProject = (projectId) => {
    setTrackerState((prev) => {
      const project = prev.projects.find((item) => item.id === projectId);
      if (!project) return prev;
      return {
        ...prev,
        activeProjectId: projectId,
        activeTableId: project.tables[0]?.id || "",
      };
    });
  };

  const handleSelectTable = (tableId) => {
    setTrackerState((prev) => ({ ...prev, activeTableId: tableId }));
  };

  const clearLegacyPayload = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  };

  const handleLegacyImport = () => {
    if (!legacyState) return;
    setLegacyPromptOpen(false);
    clearLegacyPayload();
    setTrackerState(legacyState);
  };

  const handleLegacyIgnore = () => {
    setLegacyPromptOpen(false);
    setLegacyState(null);
    clearLegacyPayload();
  };

  const handleExport = async (format) => {
    setTransferBusy(true);
    setError("");
    try {
      const options =
        format === "json"
          ? {}
          : { projectId: activeProject?.id, tableId: activeTable?.id };
      const { blob, filename } = await exportTracker(format, options);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || t("errors.exportTracker"));
    } finally {
      setTransferBusy(false);
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm(t("tracker.importConfirm"))) {
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    setTransferBusy(true);
    setError("");
    try {
      const data = await importTracker(file, ext);
      if (data && Array.isArray(data.projects)) {
        setTrackerState(data);
        setLastSavedAt(new Date());
      }
    } catch (err) {
      setError(err.message || t("errors.importTracker"));
    } finally {
      setTransferBusy(false);
    }
  };

  const handleAddRow = () => {
    if (!activeTable) return;
    const nextSeq = getNextSeq(activeTable.rows || []);
    const row = {
      id: createId("row"),
      seq: nextSeq,
      cells: activeTable.columns.reduce((acc, column) => {
        if (column.type === "auto") return acc;
        acc[column.id] = getDefaultValueForType(column.type);
        return acc;
      }, {}),
    };
    updateActiveTable((table) => ({
      ...table,
      rows: [...table.rows, row],
    }));
  };

  const handleDeleteRow = (row) => {
    if (!row) return;
    if (!window.confirm(t("tracker.confirmDeleteRow", { seq: row.seq }))) return;
    updateActiveTable((table) => ({
      ...table,
      rows: table.rows.filter((item) => item.id !== row.id),
    }));
  };

  const handleCellChange = (rowId, column, value) => {
    updateActiveTable((table) => {
      const rowsNext = table.rows.map((row) => {
        if (row.id !== rowId) return row;
        const cellsNext = { ...row.cells };
        if (column.type !== "auto") {
          cellsNext[column.id] = value;
        }
        return { ...row, cells: cellsNext };
      });
      return { ...table, rows: rowsNext };
    });
  };

  const handleColumnLabelChange = (columnId, value) => {
    updateActiveTable((table) => {
      const columnsNext = table.columns.map((column) =>
        column.id === columnId ? { ...column, label: value } : column
      );
      return { ...table, columns: columnsNext };
    });
  };

  const handleColumnTypeChange = (columnId, nextType) => {
    updateActiveTable((table) => {
      const columnsNext = table.columns.map((column) => {
        if (column.id !== columnId) return column;
        const updated = { ...column, type: nextType };
        if (nextType === "select" && !Array.isArray(updated.options)) {
          updated.options = [];
        }
        if (nextType !== "select") {
          delete updated.options;
        }
        return updated;
      });
      const rowsNext = table.rows.map((row) => ({
        ...row,
        cells: {
          ...row.cells,
          [columnId]: getDefaultValueForType(nextType),
        },
      }));
      return { ...table, columns: columnsNext, rows: rowsNext };
    });
  };

  const handleColumnOptionsChange = (columnId, value) => {
    const options = parseOptions(value);
    updateActiveTable((table) => {
      const columnsNext = table.columns.map((column) =>
        column.id === columnId ? { ...column, options } : column
      );
      const rowsNext = table.rows.map((row) => {
        const currentValue = row.cells?.[columnId];
        if (currentValue && !options.includes(currentValue)) {
          return {
            ...row,
            cells: {
              ...row.cells,
              [columnId]: "",
            },
          };
        }
        return row;
      });
      return { ...table, columns: columnsNext, rows: rowsNext };
    });
  };

  const handleAddColumn = () => {
    const newColumn = {
      id: createId("col"),
      label: t("tracker.newColumnName"),
      type: "text",
    };
    updateActiveTable((table) => {
      const columnsNext = [...table.columns, newColumn];
      const rowsNext = table.rows.map((row) => ({
        ...row,
        cells: {
          ...row.cells,
          [newColumn.id]: "",
        },
      }));
      return { ...table, columns: columnsNext, rows: rowsNext };
    });
  };

  const handleDeleteColumn = (columnId) => {
    updateActiveTable((table) => {
      const column = table.columns.find((item) => item.id === columnId);
      if (!column || column.locked) return table;
      const columnsNext = table.columns.filter((item) => item.id !== columnId);
      const rowsNext = table.rows.map((row) => {
        const nextCells = { ...row.cells };
        delete nextCells[columnId];
        return { ...row, cells: nextCells };
      });
      return { ...table, columns: columnsNext, rows: rowsNext };
    });
  };

  const columnTypes = useMemo(
    () => [
      { value: "auto", label: t("tracker.columnTypeAuto") },
      { value: "text", label: t("tracker.columnTypeText") },
      { value: "longtext", label: t("tracker.columnTypeLongText") },
      { value: "date", label: t("tracker.columnTypeDate") },
      { value: "time", label: t("tracker.columnTypeTime") },
      { value: "select", label: t("tracker.columnTypeSelect") },
      { value: "boolean", label: t("tracker.columnTypeBoolean") },
    ],
    [t]
  );

  const syncStatus = useMemo(() => {
    if (loading) return t("common.loading");
    if (syncError) return t("tracker.syncError");
    if (syncing) return t("tracker.syncSaving");
    if (lastSavedAt) {
      return `${t("tracker.syncSaved")} ${lastSavedAt.toLocaleTimeString()}`;
    }
    return t("tracker.syncSaved");
  }, [loading, syncing, syncError, lastSavedAt, t]);

  const filteredRows = useMemo(() => {
    if (!activeTable) return [];
    const query = search.trim().toLowerCase();
    if (!query) return activeTable.rows;
    return activeTable.rows.filter((row) =>
      activeTable.columns.some((column) => {
        const value = column.type === "auto" ? row.seq : row.cells?.[column.id];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      })
    );
  }, [activeTable, search]);

  const renderCell = (row, column) => {
    if (column.type === "auto") {
      return <span className="sheet-cell-readonly">{row.seq}</span>;
    }
    const value = row.cells?.[column.id];
    switch (column.type) {
      case "boolean":
        return (
          <div className="sheet-cell-checkbox">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => handleCellChange(row.id, column, event.target.checked)}
              aria-label={column.label}
            />
          </div>
        );
      case "select":
        return (
          <select
            value={value || ""}
            onChange={(event) => handleCellChange(row.id, column, event.target.value)}
            aria-label={column.label}
          >
            <option value="">{t("tracker.selectPlaceholder")}</option>
            {(column.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "date":
        return (
          <input
            type="date"
            value={value || ""}
            onChange={(event) => handleCellChange(row.id, column, event.target.value)}
            aria-label={column.label}
          />
        );
      case "time":
        return (
          <input
            type="time"
            value={value || ""}
            onChange={(event) => handleCellChange(row.id, column, event.target.value)}
            aria-label={column.label}
          />
        );
      case "longtext":
        return (
          <textarea
            value={value || ""}
            onChange={(event) => handleCellChange(row.id, column, event.target.value)}
            aria-label={column.label}
            rows={1}
          />
        );
      default:
        return (
          <input
            type="text"
            value={value || ""}
            onChange={(event) => handleCellChange(row.id, column, event.target.value)}
            aria-label={column.label}
          />
        );
    }
  };

  return (
    <div className="page sheet-page">
      <div className="page-header">
        <div>
          <div className="page-title">{t("tracker.title")}</div>
          <div className="page-subtitle">{t("tracker.subtitle")}</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" type="button" onClick={handleAddProject}>
            {t("tracker.addProject")}
          </button>
          <button className="btn" type="button" onClick={handleAddTable} disabled={!activeProject}>
            {t("tracker.addTable")}
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {legacyPromptOpen ? (
        <div className="card sheet-legacy-card">
          <div className="sheet-legacy-text">
            <div className="card-title">{t("tracker.legacyTitle")}</div>
            <div className="muted">{t("tracker.legacyDesc")}</div>
          </div>
          <div className="btn-row">
            <button className="btn" type="button" onClick={handleLegacyImport}>
              {t("tracker.legacyImport")}
            </button>
            <button className="btn btn-outline" type="button" onClick={handleLegacyIgnore}>
              {t("tracker.legacyIgnore")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="sheet-layout">
        <aside className="sheet-sidebar">
          <div className="card">
            <div className="card-header">
              <div className="card-title">{t("tracker.projects")}</div>
              <button className="btn btn-ghost" type="button" onClick={handleAddProject}>
                +
              </button>
            </div>
            <div className="sheet-project-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`sheet-project-item ${
                    activeProject?.id === project.id ? "active" : ""
                  }`}
                  onClick={() => handleSelectProject(project.id)}
                >
                  <span>{project.name}</span>
                  <span className="sheet-count">{project.tables.length}</span>
                </button>
              ))}
            </div>
          </div>

          {activeProject ? (
            <div className="card">
              <div className="card-title">{t("tracker.projectSettings")}</div>
              <div className="section">
                <label className="muted" htmlFor="tracker-project-name">
                  {t("tracker.projectName")}
                </label>
                <input
                  id="tracker-project-name"
                  type="text"
                  value={activeProject.name}
                  onChange={(event) => handleProjectNameChange(event.target.value)}
                />
              </div>
              <div className="btn-row">
                <button className="btn btn-outline" type="button" onClick={handleDeleteProject}>
                  {t("tracker.deleteProject")}
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="sheet-main">
          {!activeProject || !activeTable ? (
            <div className="empty-state">{t("tracker.noProject")}</div>
          ) : (
            <>
              <div className="card sheet-tabs-card">
                <div className="sheet-tabs">
                  {activeProject.tables.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className={`sheet-tab ${table.id === activeTable.id ? "active" : ""}`}
                      onClick={() => handleSelectTable(table.id)}
                    >
                      {table.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="sheet-tab sheet-tab-add"
                    onClick={handleAddTable}
                  >
                    + {t("tracker.addTable")}
                  </button>
                </div>

                <div className="sheet-toolbar">
                  <div className="sheet-toolbar-left">
                    <div className="sheet-toolbar-block">
                      <label className="muted" htmlFor="tracker-table-name">
                        {t("tracker.tableName")}
                      </label>
                      <input
                        id="tracker-table-name"
                        type="text"
                        value={activeTable.name}
                        onChange={(event) => handleTableNameChange(event.target.value)}
                      />
                    </div>
                    <div className="sheet-toolbar-block">
                      <label className="muted" htmlFor="tracker-search">
                        {t("common.search")}
                      </label>
                      <input
                        id="tracker-search"
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t("tracker.searchPlaceholder")}
                      />
                    </div>
                  </div>
                  <div className="sheet-toolbar-actions">
                    <button className="btn" type="button" onClick={handleAddRow} disabled={loading}>
                      {t("tracker.addRow")}
                    </button>
                    <div className="sheet-action-group">
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => handleExport("json")}
                        disabled={transferBusy || loading}
                      >
                        {t("tracker.exportJson")}
                      </button>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => handleExport("csv")}
                        disabled={transferBusy || loading || !activeTable}
                      >
                        {t("tracker.exportCsv")}
                      </button>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => handleExport("xlsx")}
                        disabled={transferBusy || loading || !activeTable}
                      >
                        {t("tracker.exportXlsx")}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={transferBusy || loading}
                      >
                        {t("tracker.import")}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.json,.xlsx"
                        style={{ display: "none" }}
                        onChange={handleImportFile}
                      />
                    </div>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={handleDeleteTable}
                      disabled={activeProject.tables.length <= 1}
                    >
                      {t("tracker.deleteTable")}
                    </button>
                    <div className={`sheet-sync-status ${syncError ? "error" : ""}`}>
                      {syncStatus}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sheet-table-wrapper">
                {filteredRows.length ? (
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        {activeTable.columns.map((column) => (
                          <th
                            key={column.id}
                            style={{ minWidth: `${columnWidthMap[column.type] || 160}px` }}
                          >
                            {column.label}
                          </th>
                        ))}
                        <th className="sheet-actions-col">{t("tracker.rowActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          {activeTable.columns.map((column) => (
                            <td key={column.id}>
                              <div className={`sheet-cell type-${column.type}`}>
                                {renderCell(row, column)}
                              </div>
                            </td>
                          ))}
                          <td>
                            <div className="sheet-row-actions">
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => handleDeleteRow(row)}
                              >
                                {t("tracker.deleteRow")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    {t("tracker.emptyRows")}
                    <div className="btn-row">
                      <button className="btn" type="button" onClick={handleAddRow}>
                        {t("tracker.addRow")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={`collapsible-panel ${columnsOpen ? "open" : ""}`}>
                <button
                  className="collapsible-header"
                  type="button"
                  onClick={() => setColumnsOpen((prev) => !prev)}
                  aria-expanded={columnsOpen}
                >
                  <span>{t("tracker.columnSettings")}</span>
                  <span className="collapsible-icon">{columnsOpen ? "-" : "+"}</span>
                </button>
                <div className="collapsible-body">
                  <div className="sheet-columns">
                    <div className="sheet-column-head">
                      <span className="muted">{t("tracker.columnLabel")}</span>
                      <span className="muted">{t("tracker.columnType")}</span>
                      <span className="muted">{t("tracker.columnOptions")}</span>
                      <span className="muted">{t("tracker.columnActions")}</span>
                    </div>
                    {activeTable.columns.map((column) => {
                      const optionsValue = Array.isArray(column.options)
                        ? column.options.join(", ")
                        : "";
                      return (
                        <div className="sheet-column-row" key={column.id}>
                          <input
                            type="text"
                            value={column.label}
                            onChange={(event) =>
                              handleColumnLabelChange(column.id, event.target.value)
                            }
                            readOnly={column.locked}
                          />
                          <select
                            value={column.type}
                            onChange={(event) =>
                              handleColumnTypeChange(column.id, event.target.value)
                            }
                            disabled={column.locked}
                          >
                            {columnTypes.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {column.type === "select" ? (
                            <input
                              type="text"
                              value={optionsValue}
                              onChange={(event) =>
                                handleColumnOptionsChange(column.id, event.target.value)
                              }
                              placeholder={t("tracker.columnOptionsHint")}
                            />
                          ) : (
                            <span className="sheet-column-placeholder">
                              {t("tracker.columnOptionsEmpty")}
                            </span>
                          )}
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => handleDeleteColumn(column.id)}
                            disabled={column.locked}
                          >
                            {t("tracker.deleteColumn")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sheet-column-actions">
                    <button className="btn btn-outline" type="button" onClick={handleAddColumn}>
                      {t("tracker.addColumn")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
