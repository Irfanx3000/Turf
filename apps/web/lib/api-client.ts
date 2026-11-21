/**
 * Typed API client. All calls go to the NestJS API; auth rides on the
 * httpOnly turf_session cookie (set by /auth/login) with Bearer fallback.
 * Business logic is never duplicated here — the API is the source of truth.
 */
import type { ApiError } from "@turf/shared-types";

/**
 * Same-origin by default: requests hit the Next server, which proxies
 * /api/v1/* to the NestJS API (see next.config.mjs rewrites). This keeps
 * cookies first-party and works behind any host the web app is served from.
 * Set NEXT_PUBLIC_API_URL (e.g. https://api.example.com/api/v1) when the API
 * is served from a different origin.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    const err = body as Partial<ApiError> | undefined;
    throw new ApiClientError(
      res.status,
      err?.errorCode ?? "NETWORK",
      Array.isArray(err?.message) ? err!.message!.join("; ") : err?.message ?? `Request failed (${res.status})`,
      err?.requestId,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
