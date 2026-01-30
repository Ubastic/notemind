const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;

  const candidate = payload.detail ?? payload.message ?? payload.error;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate;
  }

  if (Array.isArray(candidate) && candidate.length) {
    const first = candidate[0];
    if (typeof first === "string" && first.trim()) return first;
    if (first && typeof first === "object") {
      const msg = first.msg ?? first.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    try {
      return JSON.stringify(candidate);
    } catch {
      return fallback;
    }
  }

  if (candidate && typeof candidate === "object") {
    const msg = candidate.msg ?? candidate.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    try {
      return JSON.stringify(candidate);
    } catch {
      return fallback;
    }
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

export async function apiFetch(path, options = {}) {
  const { skipAuth, ...rest } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(rest.headers || {}),
  };
  const config = { credentials: "include", ...rest, headers };
  if (config.body && typeof config.body === "object") {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(`${API_BASE}${path}`, config);
  if (response.status === 204) {
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:logout"));
      }
    }
    throw new Error(extractErrorMessage(payload, "Request failed"));
  }
  return payload;
}

export async function listNotes(options = {}) {
  const {
    page = 1,
    pageSize = 20,
    category,
    tag,
    q,
    timeStart,
    timeEnd,
    includeContent,
    includeCompleted,
  } = options;

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (category) params.set("category", String(category));
  if (tag) params.set("tag", String(tag));
  if (q) params.set("q", String(q));
  if (timeStart) params.set("time_start", String(timeStart));
  if (timeEnd) params.set("time_end", String(timeEnd));
  if (includeContent !== undefined) {
    params.set("include_content", includeContent ? "true" : "false");
  }
  if (includeCompleted !== undefined) {
    params.set("include_completed", includeCompleted ? "true" : "false");
  }
  return apiFetch(`/notes?${params.toString()}`);
}

export async function getNotesTimeline(options = {}) {
  const { group = "month", category, tag, timeStart, timeEnd, includeCompleted } = options;
  const params = new URLSearchParams({ group: String(group) });
  if (category) params.set("category", String(category));
  if (tag) params.set("tag", String(tag));
  if (timeStart) params.set("time_start", String(timeStart));
  if (timeEnd) params.set("time_end", String(timeEnd));
  if (includeCompleted !== undefined) {
    params.set("include_completed", includeCompleted ? "true" : "false");
  }
  return apiFetch(`/notes/timeline?${params.toString()}`);
}

export async function listAttachments(options = {}) {
  const { page = 1, pageSize = 20, noteId } = options;
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (noteId) {
    params.set("note_id", String(noteId));
  }
  return apiFetch(`/attachments?${params.toString()}`);
}

export async function deleteAttachment(attachmentId) {
  if (!attachmentId) {
    throw new Error("Missing attachment id");
  }
  return apiFetch(`/attachments/${attachmentId}`, { method: "DELETE" });
}

export async function updateNote(noteId, updates) {
  return apiFetch(`/notes/${noteId}`, {
    method: "PUT",
    body: updates,
  });
}

export async function uploadAttachment(file, noteId) {
  if (!file) {
    throw new Error("Missing file");
  }
  const formData = new FormData();
  formData.append("file", file);
  if (noteId) {
    formData.append("note_id", String(noteId));
  }
  const response = await fetch(`${API_BASE}/attachments`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:logout"));
      }
    }
    throw new Error(extractErrorMessage(payload, "Upload failed"));
  }
  return payload;
}

export async function getTracker() {
  return apiFetch("/tracker");
}

export async function saveTracker(payload) {
  return apiFetch("/tracker", {
    method: "PUT",
    body: payload,
  });
}

export async function exportTracker(format = "json", options = {}) {
  const params = new URLSearchParams({ format });
  if (options.projectId) params.set("project_id", String(options.projectId));
  if (options.tableId) params.set("table_id", String(options.tableId));
  const response = await fetch(`${API_BASE}/tracker/export?${params.toString()}`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:logout"));
    }
    throw new Error(extractErrorMessage(payload, "Export failed"));
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match ? match[1] : `tracker.${format}`;
  return { blob, filename };
}

export async function importTracker(file, format, options = {}) {
  if (!file) {
    throw new Error("Missing file");
  }
  const params = new URLSearchParams();
  if (format) params.set("format", String(format));
  if (options.projectId) params.set("project_id", String(options.projectId));
  if (options.tableId) params.set("table_id", String(options.tableId));
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/tracker/import?${params.toString()}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:logout"));
    }
    throw new Error(extractErrorMessage(payload, "Import failed"));
  }
  return payload;
}

export async function organizeNotes(options = {}) {
  return apiFetch("/ai/organize", {
    method: "POST",
    body: { dry_run: true, ...options },
  });
}

export async function applyOrganization(categories) {
  return apiFetch("/ai/organize/apply", {
    method: "POST",
    body: { categories },
  });
}
