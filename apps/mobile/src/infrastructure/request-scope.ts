export type MobileRequestScope = "public" | "user" | "admin";

const userRoutePattern = /^\/api\/auth(?:\/|$)/;
const alwaysAdminPatterns = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/account(?:\/|$)/,
  /^\/api\/users(?:\/|$)/
] as const;

function verb(method?: string) {
  return String(method || "GET").toUpperCase();
}

export function normalizeApiPath(path: string) {
  const value = String(path || "").trim();
  if (!value.startsWith("/api/")) throw new Error("Mobile API path must start with /api/");
  if (value.includes("\\") || value.includes("..")) throw new Error("Unsafe mobile API path");
  return value;
}

export function requiredScope(path: string, method?: string): MobileRequestScope {
  const normalized = normalizeApiPath(path);
  const requestMethod = verb(method);
  if (userRoutePattern.test(normalized)) return "user";
  if (alwaysAdminPatterns.some((pattern) => pattern.test(normalized))) return "admin";
  if (/^\/api\/agents(?:\/|$)/.test(normalized)) return requestMethod === "GET" ? "public" : "admin";
  if (/^\/api\/leads(?:\/|$)/.test(normalized)) return normalized === "/api/leads" && requestMethod === "POST" ? "public" : "admin";
  if (/^\/api\/provisioning\/qwen\/public-key$/.test(normalized) && requestMethod === "GET") return "public";
  if (/^\/api\/provisioning(?:\/|$)/.test(normalized)) return "admin";
  return "public";
}

export function assertScope(path: string, scope: MobileRequestScope, method?: string) {
  const expected = requiredScope(path, method);
  if (expected !== scope) {
    throw new Error(`Request scope mismatch: ${verb(method)} ${path} requires ${expected}`);
  }
}

export function isSafeMethod(method?: string) {
  return new Set(["GET", "HEAD", "OPTIONS"]).has(verb(method));
}

export function isRetriableStatus(status: number, method?: string) {
  return isSafeMethod(method) && (status === 408 || status === 425 || status === 429 || status >= 500);
}

export function retryDelayMs(attempt: number, retryAfterSeconds: number | null = null) {
  if (retryAfterSeconds !== null) return Math.min(30_000, Math.max(0, retryAfterSeconds * 1000));
  const base = Math.min(8_000, 350 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}
