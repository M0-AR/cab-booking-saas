"use client";

import {
  ApiError,
  clearSession,
  extractDetail,
  getAccessToken,
  getRefreshToken,
  setSession,
} from "@/lib/session";
import type { TokenResponse } from "@/lib/types";

export const API_BASE = "/api/v1";

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      setSession((await res.json()) as TokenResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retryOn401?: boolean;
}

export async function api<T>(
  path: string,
  { method = "GET", body, auth = true, retryOn401 = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retryOn401) {
    if (await refreshSession()) {
      return api<T>(path, { method, body, auth, retryOn401: false });
    }
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      clearSession();
      location.href = "/login";
    }
    throw new ApiError(401, "Session expired, please sign in again");
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, extractDetail(payload, `Request failed (${res.status})`));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Authenticated file download (CSV exports). Reuses the same 401-refresh
 * path as `api`, then hands the response to the browser as a download.
 */
export async function downloadFile(
  path: string,
  fallbackName: string,
): Promise<void> {
  const run = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, { headers });
  };

  let res = await run();
  if (res.status === 401 && (await refreshSession())) {
    res = await run();
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      res.status,
      extractDetail(payload, `Export failed (${res.status})`),
    );
  }

  const blob = await res.blob();
  const name =
    filenameFromDisposition(res.headers.get("content-disposition")) ??
    fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
