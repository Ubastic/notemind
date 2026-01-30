import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "notemind_language";
const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "zh"];

const RESOURCES = {
  en: {
    htmlLang: "en",
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    defaultCategories: [
      { key: "credential", label: "Credentials" },
      { key: "work", label: "Work" },
      { key: "idea", label: "Ideas" },
      { key: "todo", label: "Todo" },
    ],
    strings: {
      language: {
        label: "Language",
        english: "English",
        chinese: "中文",
      },
      brand: {
        subtitle: "Second brain, minimal focus.",
      },
      nav: {
        timeline: "Timeline",
        tags: "Tags",
        attachments: "Attachments",
        tracker: "Tracker",
        completedToggle: "Completed notes",
        hideCompleted: "Active",
        showCompleted: "All",
        random: "Random",
        settings: "Settings",
        menu: "Menu",
        close: "Close menu",
      },
      common: {
        loading: "Loading...",
        saving: "Saving...",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        copy: "Copy",
        back: "Back",
        search: "Search",
        clear: "Clear",
        shuffle: "Shuffle",
        pin: "Pin",
        unpin: "Unpin",
        pinned: "Pinned",
        saveNote: "Save note",
        noNotes: "No notes yet.",
        noDates: "No dates yet",
        untitledNote: "Untitled note",
        notGenerated: "Not generated.",
        notSet: "Not set",
        sensitive: "Sensitive",
        notesCount: "{count} notes",
        notesMore: "+{count} more",
        unknown: "Unknown",
        unknownDate: "Unknown date",
        category: "Category",
        folder: "Folder",
        unclassified: "Unclassified",
        emptyFolder: "This folder is empty.",
        day: "Day",
        month: "Month",
        view: "View",
      },
      editor: {
        uploadImage: "Image",
        uploadFile: "File",
        highlight: "Highlight",
      },
      auth: {
        logout: "Log out",
        loginTitle: "Welcome back",
        loginSubtitle: "Sign in to your private workspace.",
        username: "Username",
        password: "Password",
        signIn: "Sign in",
        signingIn: "Signing in...",
        noAccount: "No account yet? ",
        createOne: "Create one",
        noAccountSuffix: ".",
        registerTitle: "Create account",
        registerSubtitle: "Start a private, encrypted notebook.",
        passwordMin: "Password (min 6 chars)",
        creating: "Creating...",
        createAccount: "Create account",
        haveAccount: "Already have an account? ",
        signInLink: "Sign in",
        haveAccountSuffix: ".",
      },
      home: {
        title: "Timeline",
        subtitle: "Capture fast, auto organizes the rest.",
        quickCapture: "Quick capture",
        titlePlaceholder: "Title (optional)",
        aiDecide: "AI decide",
        capturePlaceholder: "Drop anything here...",
        searchPlaceholder: "Search notes",
        loadingNotes: "Loading notes...",
        emptyNotes: "No notes yet. Add the first one above.",
      },
      category: {
        filtered: "Filtered by category.",
        filteredWithSearch: "Filtered by category and search: \"{query}\".",
        viewFolders: "Folders",
        viewTimeFolders: "Time",
        viewStructure: "Structure",
        viewCards: "Cards",
        quickCapture: "Quick capture",
        titlePlaceholder: "Title (optional)",
        folderPlaceholder: "Folder (e.g. Work/Project)",
        capturePlaceholder: "Add a note in {category}...",
        searchPlaceholder: "Search {category} notes",
        loadingNotes: "Loading notes...",
        emptyNoMatch: "No matching notes in this category.",
        emptyNoNotes: "No notes in this category.",
      },
      tags: {
        title: "Tags",
        subtitle: "Group notes by tag and explore.",
        tagList: "Tag list",
        searchPlaceholder: "Filter tags",
        loadingTags: "Loading tags...",
        emptyTags: "No tags yet.",
        activeTag: "Active tag",
        selectHint: "Select a tag to see notes.",
        loadingNotes: "Loading notes...",
        emptyNotes: "No notes with this tag.",
        loadMore: "Load more",
        loadingMore: "Loading more...",
      },
      attachments: {
        title: "Attachments",
        subtitle: "Manage every uploaded file in one place.",
        subtitleFiltered: "Filtered to note #{noteId}.",
        count: "{count} attachments",
        noteFilter: "Filter by note",
        noteIdPlaceholder: "Note ID",
        applyFilter: "Apply",
        typeLabel: "Type",
        typeAll: "All",
        typeImages: "Images",
        typeFiles: "Files",
        searchPlaceholder: "Search attachments",
        loading: "Loading attachments...",
        empty: "No attachments yet.",
        emptyFiltered: "No attachments match this filter.",
        openNote: "Open note",
        unlinked: "Not linked to a note",
        download: "Download",
        copyLink: "Copy link",
        deleteConfirm: "Delete \"{name}\"?",
        noteIdInvalid: "Enter a valid note ID.",
      },
      tracker: {
        title: "Requirements tracker",
        subtitle: "A lightweight sheet for requests, bugs, owners, dates, and status.",
        projects: "Projects",
        projectSettings: "Project settings",
        tables: "Tables",
        projectName: "Project name",
        tableName: "Table name",
        addProject: "New project",
        addTable: "New table",
        deleteProject: "Delete project",
        deleteTable: "Delete table",
        addRow: "Add row",
        deleteRow: "Delete",
        rowActions: "Actions",
        searchPlaceholder: "Search rows",
        emptyRows: "No records yet. Add the first row.",
        noProject: "No project yet. Create one to start.",
        export: "Export",
        import: "Import",
        exportJson: "Export JSON",
        exportCsv: "Export CSV",
        exportXlsx: "Export XLSX",
        importConfirm: "Import will replace the current table. Continue?",
        syncSaving: "Saving...",
        syncSaved: "Saved",
        syncError: "Sync failed",
        legacyTitle: "Local tracker data found",
        legacyDesc: "This device has tracker data from a previous account. Import it to this account or ignore it.",
        legacyImport: "Import to this account",
        legacyIgnore: "Ignore",
        columnSettings: "Column settings",
        addColumn: "Add column",
        deleteColumn: "Remove",
        columnLabel: "Field",
        columnType: "Type",
        columnOptions: "Options",
        columnOptionsHint: "Comma-separated",
        columnOptionsEmpty: "-",
        columnActions: "Actions",
        newColumnName: "New field",
        selectPlaceholder: "Select...",
        columnTypeAuto: "Auto number",
        columnTypeText: "Text",
        columnTypeLongText: "Long text",
        columnTypeDate: "Date",
        columnTypeTime: "Time",
        columnTypeSelect: "Select",
        columnTypeBoolean: "Yes/No",
        defaultProjectName: "Default project",
        defaultTableName: "Sheet",
        defaultTypeOptions: "Request,Bug,Improvement",
        defaultStatusOptions: "Backlog,In progress,Done,On hold",
        confirmDeleteProject: "Delete project \"{name}\"?",
        confirmDeleteTable: "Delete table \"{name}\"?",
        confirmDeleteRow: "Delete row #{seq}?",
        columns: {
          seq: "Seq",
          title: "Request / Issue",
          type: "Type",
          requester: "Requester",
          reportDate: "Reported date",
          reportTime: "Reported time",
          targetDate: "Target date",
          owner: "Owner",
          status: "Status",
          done: "Done",
          notes: "Notes",
        },
      },
      note: {
        detailTitle: "Note detail",
        loading: "Loading note...",
        notFound: "Note not found.",
        relatedTitle: "Related notes",
        relatedLoading: "Finding related notes...",
        relatedEmpty: "No related notes yet.",
        relatedModeAi: "AI similarity",
        relatedModeClassic: "Keyword match",
        shareLink: "Share link",
        edit: "Edit note",
        shortTitle: "Short title",
        folder: "Folder",
        folderPlaceholder: "Folder (e.g. Work/Project)",
        sensitivity: "Sensitivity",
        created: "Created",
        tags: "Tags",
        entities: "Entities",
        deleteConfirm: "Delete this note?",
        removeTag: "Remove tag {tag}",
        removeTagConfirm: "Remove tag \"{tag}\"?",
        matchLabel: "Match: {match}",
        keywordsLabel: "Keywords: {keywords}",
        similarityLabel: "Similarity: {score}",
        openDetail: "Open detail",
        aiSummary: "AI summary",
        completed: "Completed",
        markCompleted: "Mark completed",
        markActive: "Mark active",
      },
      random: {
        title: "Random",
        subtitle: "A single note to spark ideas.",
      },
      search: {
        title: "Search",
        results: "Results for \"{query}\"",
        loading: "Searching...",
        empty: "No results found.",
      },
      settings: {
        title: "Settings",
        subtitle: "Manage data exports and preferences.",
        profile: "Profile",
        username: "Username",
        dataExport: "Data export",
        dataExportDesc: "Download a JSON file with your decrypted notes and metadata.",
        exportButton: "Export JSON",
        exporting: "Exporting...",
        aiFeatures: "AI features",
        aiDesc: "Enable LLM-based summaries, tags, and semantic search.",
        aiToggle: "Enable AI (LLM)",
        categories: "Categories",
        resetDefaults: "Reset defaults",
        saveCategories: "Save categories",
        categoriesDesc: "Customize the category tabs and classification. Leave empty to use the defaults.",
        categoryLabel: "Label",
        categoryKey: "Key (used in URL and classification)",
        remove: "Remove",
        addCategory: "Add category",
        searchIndex: "Semantic search index",
        searchIndexDesc: "Rebuild embeddings so semantic search can find older notes.",
        reanalyze: "Reanalyze notes (slower, uses LLM)",
        rebuild: "Rebuild embeddings",
        rebuilding: "Rebuilding...",
        aiDisabled: "AI is disabled. Enable it to rebuild embeddings.",
        rebuildResult: "Updated {updated} / {total} notes. Failed: {failed}.",
      },
      share: {
        readOnly: "Read-only view.",
        sharedNote: "Shared note",
      },
      errors: {
        loadNotes: "Failed to load notes",
        saveNote: "Failed to save note",
        deleteFailed: "Delete failed",
        copyFailed: "Copy failed",
        loadNote: "Failed to load note",
        updateFailed: "Update failed",
        shareFailed: "Share failed",
        searchFailed: "Search failed",
        exportFailed: "Export failed",
        rebuildFailed: "Rebuild failed",
        loadShare: "Failed to load share",
        loadRelated: "Failed to load related notes",
        loginFailed: "Login failed",
        registerFailed: "Registration failed",
        loadSettings: "Failed to load settings",
        saveSettings: "Failed to save settings",
        loadTracker: "Failed to load tracker",
        saveTracker: "Failed to save tracker",
        exportTracker: "Export failed",
        importTracker: "Import failed",
        notAuthenticated: "Not authenticated",
        settingsUnavailable: "Settings are not available yet.",
        categoryKeyRequired: "Every category needs a key or remove empty rows.",
        duplicateKey: "Duplicate key: {key}.",
        categoriesSaved: "Categories saved.",
        uploadFailed: "Upload failed",
      },
      match: {
        keyword: "keyword",
        semantic: "semantic",
      },
      sensitivity: {
        low: "low",
        medium: "medium",
        high: "high",
      },
    },
  },
  zh: {
    htmlLang: "zh-CN",
    monthsShort: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    weekdaysShort: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    defaultCategories: [
      { key: "credential", label: "凭证" },
      { key: "work", label: "工作" },
      { key: "idea", label: "想法" },
      { key: "todo", label: "待办" },
    ],
    strings: {
      language: {
        label: "语言",
        english: "English",
        chinese: "中文",
      },
      brand: {
        subtitle: "第二大脑，专注极简。",
      },
      nav: {
        timeline: "时间线",
        tags: "标签",
        attachments: "附件",
        tracker: "需求",
        completedToggle: "完结笔记",
        hideCompleted: "进行中",
        showCompleted: "含完结",
        random: "随机",
        settings: "设置",
        menu: "菜单",
        close: "关闭菜单",
      },
      common: {
        loading: "加载中...",
        saving: "保存中...",
        save: "保存",
        cancel: "取消",
        delete: "删除",
        copy: "复制",
        back: "返回",
        search: "搜索",
        clear: "清除",
        shuffle: "换一个",
        pin: "置顶",
        unpin: "取消置顶",
        pinned: "已置顶",
        saveNote: "保存笔记",
        noNotes: "还没有笔记。",
        noDates: "暂无日期",
        untitledNote: "无标题笔记",
        notGenerated: "未生成",
        notSet: "未设置",
        sensitive: "敏感",
        notesCount: "{count} 条笔记",
        notesMore: "+{count} 更多",
        unknown: "未知",
        unknownDate: "未知日期",
        category: "分类",
        day: "日",
        month: "月",
        view: "视图",
      },
      editor: {
        uploadImage: "图片",
        uploadFile: "文件",
        highlight: "高亮",
      },
      auth: {
        logout: "退出",
        loginTitle: "欢迎回来",
        loginSubtitle: "登录到你的私密空间。",
        username: "用户名",
        password: "密码",
        signIn: "登录",
        signingIn: "登录中...",
        noAccount: "还没有账号？",
        createOne: "创建一个",
        noAccountSuffix: "。",
        registerTitle: "创建账号",
        registerSubtitle: "开始一个私密加密笔记本。",
        passwordMin: "密码（至少 6 位）",
        creating: "创建中...",
        createAccount: "创建账号",
        haveAccount: "已有账号？",
        signInLink: "登录",
        haveAccountSuffix: "。",
      },
      home: {
        title: "时间线",
        subtitle: "快速记录，自动整理。",
        quickCapture: "快速记录",
        titlePlaceholder: "标题（可选）",
        aiDecide: "AI 决定",
        capturePlaceholder: "随手记录任何内容...",
        searchPlaceholder: "搜索笔记",
        loadingNotes: "加载笔记中...",
        emptyNotes: "暂无笔记，先在上方记录第一条。",
      },
      category: {
        filtered: "已按分类过滤。",
        filteredWithSearch: "已按分类与搜索过滤: \"{query}\"。",
        viewFolders: "文件夹",
        viewTimeFolders: "时间",
        viewStructure: "目录",
        viewCards: "卡片",
        quickCapture: "快速记录",
        titlePlaceholder: "标题（可选）",
        folderPlaceholder: "文件夹（如 工作/项目）",
        capturePlaceholder: "在 {category} 中添加笔记...",
        searchPlaceholder: "搜索 {category} 笔记",
        loadingNotes: "加载笔记中...",
        emptyNoMatch: "该分类下没有匹配的笔记。",
        emptyNoNotes: "该分类下暂无笔记。",
      },
      tags: {
        title: "标签",
        subtitle: "按标签归拢查看笔记。",
        tagList: "标签列表",
        searchPlaceholder: "筛选标签",
        loadingTags: "加载标签中...",
        emptyTags: "暂无标签。",
        activeTag: "当前标签",
        selectHint: "选择一个标签查看对应笔记。",
        loadingNotes: "加载笔记中...",
        emptyNotes: "该标签下暂无笔记。",
        loadMore: "加载更多",
        loadingMore: "加载中...",
      },
      attachments: {
        title: "附件",
        subtitle: "集中管理已上传的文件。",
        subtitleFiltered: "已筛选笔记 #{noteId} 的附件。",
        count: "{count} 个附件",
        noteFilter: "按笔记筛选",
        noteIdPlaceholder: "笔记 ID",
        applyFilter: "应用",
        typeLabel: "类型",
        typeAll: "全部",
        typeImages: "图片",
        typeFiles: "文件",
        searchPlaceholder: "搜索附件",
        loading: "加载附件中...",
        empty: "暂无附件。",
        emptyFiltered: "没有匹配的附件。",
        openNote: "查看笔记",
        unlinked: "未关联笔记",
        download: "下载",
        copyLink: "复制链接",
        deleteConfirm: "删除 \"{name}\"？",
        noteIdInvalid: "请输入有效的笔记 ID。",
      },
      tracker: {
        title: "需求与缺陷表",
        subtitle: "像在线表格一样记录需求、Bug、提出人、时间与进度。",
        projects: "项目",
        projectSettings: "项目设置",
        tables: "表单",
        projectName: "项目名称",
        tableName: "表单名称",
        addProject: "新建项目",
        addTable: "新建表单",
        deleteProject: "删除项目",
        deleteTable: "删除表单",
        addRow: "新增一行",
        deleteRow: "删除",
        rowActions: "操作",
        searchPlaceholder: "搜索记录",
        emptyRows: "暂无记录，先新增一行。",
        noProject: "还没有项目，先创建一个吧。",
        export: "导出",
        import: "导入",
        exportJson: "导出 JSON",
        exportCsv: "导出 CSV",
        exportXlsx: "导出 XLSX",
        importConfirm: "导入会覆盖当前表单，继续？",
        syncSaving: "保存中...",
        syncSaved: "已保存",
        syncError: "同步失败",
        legacyTitle: "检测到本地旧数据",
        legacyDesc: "这台设备上有之前账号的需求表数据，可选择导入到当前账号或忽略。",
        legacyImport: "导入到当前账号",
        legacyIgnore: "忽略",
        columnSettings: "字段配置",
        addColumn: "新增字段",
        deleteColumn: "移除",
        columnLabel: "字段名",
        columnType: "类型",
        columnOptions: "下拉选项",
        columnOptionsHint: "用英文逗号分隔",
        columnOptionsEmpty: "-",
        columnActions: "操作",
        newColumnName: "新字段",
        selectPlaceholder: "请选择",
        columnTypeAuto: "序号(自增)",
        columnTypeText: "文本",
        columnTypeLongText: "长文本",
        columnTypeDate: "日期",
        columnTypeTime: "时间",
        columnTypeSelect: "下拉",
        columnTypeBoolean: "是否",
        defaultProjectName: "默认项目",
        defaultTableName: "需求表",
        defaultTypeOptions: "需求,Bug,优化",
        defaultStatusOptions: "待排期,进行中,已完成,搁置",
        confirmDeleteProject: "删除项目 \"{name}\"？",
        confirmDeleteTable: "删除表单 \"{name}\"？",
        confirmDeleteRow: "删除第 {seq} 行？",
        columns: {
          seq: "序号",
          title: "需求/问题",
          type: "类型",
          requester: "提出人",
          reportDate: "提出日期",
          reportTime: "提出时间",
          targetDate: "期望完成",
          owner: "完成人",
          status: "状态",
          done: "是否完成",
          notes: "备注",
        },
      },
      note: {
        detailTitle: "笔记详情",
        loading: "加载笔记中...",
        notFound: "未找到笔记。",
        relatedTitle: "相关笔记",
        relatedLoading: "正在查找相关笔记...",
        relatedEmpty: "暂无相关笔记。",
        relatedModeAi: "AI 相似度",
        relatedModeClassic: "关键词匹配",
        shareLink: "分享链接",
        edit: "编辑笔记",
        shortTitle: "短标题",
        folder: "文件夹",
        folderPlaceholder: "文件夹（如 工作/项目）",
        sensitivity: "敏感度",
        created: "创建时间",
        tags: "标签",
        entities: "实体",
        deleteConfirm: "删除这条笔记？",
        removeTag: "移除标签 {tag}",
        removeTagConfirm: "移除标签 \"{tag}\"？",
        matchLabel: "匹配: {match}",
        keywordsLabel: "关键词: {keywords}",
        similarityLabel: "相似度: {score}",
        openDetail: "查看详情",
        aiSummary: "AI 摘要",
        completed: "已完结",
        markCompleted: "标记完结",
        markActive: "取消完结",
      },
      random: {
        title: "随机",
        subtitle: "一条笔记，启发灵感。",
      },
      search: {
        title: "搜索",
        results: "\"{query}\" 的搜索结果",
        loading: "搜索中...",
        empty: "暂无结果。",
      },
      settings: {
        title: "设置",
        subtitle: "管理数据导出与偏好设置。",
        profile: "个人资料",
        username: "用户名",
        dataExport: "数据导出",
        dataExportDesc: "下载包含解密笔记与元数据的 JSON 文件。",
        exportButton: "导出 JSON",
        exporting: "导出中...",
        aiFeatures: "AI 功能",
        aiDesc: "启用 LLM 摘要、标签和语义搜索。",
        aiToggle: "启用 AI（LLM）",
        categories: "分类",
        resetDefaults: "恢复默认",
        saveCategories: "保存分类",
        categoriesDesc: "自定义分类标签与规则，留空则使用默认值。",
        categoryLabel: "名称",
        categoryKey: "键（用于 URL 和分类）",
        remove: "移除",
        addCategory: "添加分类",
        searchIndex: "语义搜索索引",
        searchIndexDesc: "重建向量索引以搜索更早的笔记。",
        reanalyze: "重新分析笔记（较慢，使用 LLM）",
        rebuild: "重建向量",
        rebuilding: "重建中...",
        aiDisabled: "AI 已禁用，启用后才能重建向量。",
        rebuildResult: "已更新 {updated} / {total} 条，失败 {failed} 条。",
      },
      share: {
        readOnly: "只读视图。",
        sharedNote: "共享笔记",
      },
      errors: {
        loadNotes: "加载笔记失败",
        saveNote: "保存笔记失败",
        deleteFailed: "删除失败",
        copyFailed: "复制失败",
        loadNote: "加载笔记失败",
        updateFailed: "更新失败",
        shareFailed: "分享失败",
        searchFailed: "搜索失败",
        exportFailed: "导出失败",
        rebuildFailed: "重建失败",
        loadShare: "加载分享失败",
        loadRelated: "加载相关笔记失败",
        loginFailed: "登录失败",
        registerFailed: "注册失败",
        loadSettings: "加载设置失败",
        saveSettings: "保存设置失败",
        loadTracker: "加载需求表失败",
        saveTracker: "保存需求表失败",
        exportTracker: "导出失败",
        importTracker: "导入失败",
        notAuthenticated: "未登录",
        settingsUnavailable: "设置尚不可用。",
        categoryKeyRequired: "每个分类都需要键值，或删除空行。",
        duplicateKey: "重复的键: {key}.",
        categoriesSaved: "分类已保存。",
        uploadFailed: "上传失败",
      },
      match: {
        keyword: "关键词",
        semantic: "语义",
      },
      sensitivity: {
        low: "低",
        medium: "中",
        high: "高",
      },
    },
  },
};

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, obj);
};

const interpolate = (template, params) => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return match;
  });
};

const getInitialLanguage = () => {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED_LANGUAGES.includes(stored)) {
    return stored;
  }
  const browserLang = window.navigator.language || "";
  if (browserLang.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return DEFAULT_LANGUAGE;
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);
  const locale = RESOURCES[language] || RESOURCES[DEFAULT_LANGUAGE];
  const fallback = RESOURCES[DEFAULT_LANGUAGE];

  const t = useCallback(
    (key, params) => {
      const template =
        getByPath(locale.strings, key) ?? getByPath(fallback.strings, key) ?? key;
      return interpolate(template, params);
    },
    [locale, fallback]
  );

  const setLanguageSafe = useCallback((next) => {
    if (SUPPORTED_LANGUAGES.includes(next)) {
      setLanguage(next);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === "zh" ? "en" : "zh"));
  }, []);

  const formatMatchType = useCallback(
    (matchType) => {
      if (!matchType) return "";
      const normalized = String(matchType).toLowerCase();
      if (normalized === "keyword+semantic") {
        return `${t("match.keyword")} + ${t("match.semantic")}`;
      }
      if (normalized === "keyword") return t("match.keyword");
      if (normalized === "semantic") return t("match.semantic");
      return matchType;
    },
    [t]
  );

  const formatSensitivity = useCallback(
    (value) => {
      const normalized = String(value || "low").toLowerCase();
      const label = t(`sensitivity.${normalized}`);
      if (label.startsWith("sensitivity.")) {
        return value || t("sensitivity.low");
      }
      return label;
    },
    [t]
  );

  const categoryLabelMap = useMemo(() => {
    const map = {};
    const categories = locale.defaultCategories || fallback.defaultCategories || [];
    categories.forEach((category) => {
      if (!category || !category.key) return;
      map[String(category.key)] = category.label || category.key;
    });
    return map;
  }, [locale, fallback]);

  const formatCategoryLabel = useCallback(
    (key) => {
      if (!key) return t("common.unknown");
      return categoryLabelMap[String(key)] || key;
    },
    [categoryLabelMap, t]
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale.htmlLang || DEFAULT_LANGUAGE;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
  }, [language, locale]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: setLanguageSafe,
      toggleLanguage,
      t,
      monthsShort: locale.monthsShort || fallback.monthsShort,
      weekdaysShort: locale.weekdaysShort || fallback.weekdaysShort,
      defaultCategories: locale.defaultCategories || fallback.defaultCategories || [],
      formatCategoryLabel,
      formatMatchType,
      formatSensitivity,
    }),
    [
      language,
      setLanguageSafe,
      toggleLanguage,
      t,
      locale,
      fallback,
      formatCategoryLabel,
      formatMatchType,
      formatSensitivity,
    ]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
