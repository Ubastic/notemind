import { getToken, clearToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function apiFetch(path, options = {}) {
  const { skipAuth, ...rest } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(rest.headers || {}),
  };
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const config = { ...rest, headers };
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
      clearToken();
    }
    throw new Error(payload.detail || "Request failed");
  }
  return payload;
}
