import * as SecureStore from "expo-secure-store";
import {
  assertScope,
  isRetriableStatus,
  isSafeMethod,
  normalizeApiPath,
  retryDelayMs,
  type MobileRequestScope
} from "./infrastructure/request-scope";

const tokenKey = "prosmet.admin-token.v2";
const legacyTokenKey = "prosmet.admin-token";
const baseUrlKey = "prosmet.api-base-url.v2";
const legacyBaseUrlKey = "prosmet.api-base-url";
const defaultBaseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";

export type MobileApiRequestInit = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

export class MobileApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retriable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId: string;
    retriable: boolean;
    retryAfterSeconds: number | null;
  }) {
    super(input.message);
    this.name = "MobileApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
    this.retriable = input.retriable;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

let cachedToken: string | null | undefined;
let cachedBaseUrl: string | undefined;

function secureOptions() {
  return { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;
}

async function migrateValue(currentKey: string, legacyKey: string) {
  const current = await SecureStore.getItemAsync(currentKey);
  if (current !== null) return current;
  const legacy = await SecureStore.getItemAsync(legacyKey);
  if (legacy === null) return null;
  await SecureStore.setItemAsync(currentKey, legacy, secureOptions());
  await SecureStore.deleteItemAsync(legacyKey);
  return legacy;
}

export async function getMobileAdminToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = (await migrateValue(tokenKey, legacyTokenKey))?.trim() || null;
  return cachedToken;
}

export async function setMobileAdminToken(token: string | null) {
  cachedToken = token?.trim() || null;
  if (cachedToken) {
    await SecureStore.setItemAsync(tokenKey, cachedToken, secureOptions());
  } else {
    await SecureStore.deleteItemAsync(tokenKey);
  }
  await SecureStore.deleteItemAsync(legacyTokenKey);
}

function normalizedBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  const url = new URL(normalized);
  if (url.username || url.password || url.hash || url.search) {
    throw new Error("API URL не должен содержать логин, пароль, query или fragment.");
  }
  if (url.protocol === "https:") return normalized;
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname);
  if (url.protocol === "http:" && __DEV__ && loopback) return normalized;
  throw new Error("Production и self-hosted API должны использовать HTTPS. HTTP разрешён только для loopback в dev build.");
}

export async function getMobileApiBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await migrateValue(baseUrlKey, legacyBaseUrlKey);
  cachedBaseUrl = normalizedBaseUrl(stored || defaultBaseUrl);
  return cachedBaseUrl;
}

export async function setMobileApiBaseUrl(value: string) {
  cachedBaseUrl = normalizedBaseUrl(value);
  await SecureStore.setItemAsync(baseUrlKey, cachedBaseUrl, secureOptions());
  await SecureStore.deleteItemAsync(legacyBaseUrlKey);
}

function requestId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function linkedSignal(external: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Mobile API request timed out")), timeoutMs);
  const abort = () => controller.abort(external?.reason || new Error("Mobile API request aborted"));
  external?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      external?.removeEventListener("abort", abort);
    }
  };
}

function retryAfterSeconds(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function scopedFetch(
  scope: MobileRequestScope,
  path: string,
  init: MobileApiRequestInit = {}
) {
  const normalizedPath = normalizeApiPath(path);
  const method = String(init.method || "GET").toUpperCase();
  assertScope(normalizedPath, scope, method);
  const { timeoutMs = 25_000, retries = isSafeMethod(method) ? 2 : 0, ...requestInit } = init;
  const baseUrl = await getMobileApiBaseUrl();
  const adminToken = scope === "admin" ? await getMobileAdminToken() : null;
  if (scope === "admin" && !adminToken) throw new Error("Токен супер-администратора не настроен.");
  const correlationId = requestId();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const linked = linkedSignal(requestInit.signal, timeoutMs);
    try {
      const headers = new Headers(requestInit.headers);
      headers.set("accept", "application/json");
      headers.set("x-prosmet-request-id", correlationId);
      if (requestInit.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      if (adminToken) headers.set("x-prosmet-admin-token", adminToken);
      const response = await fetch(`${baseUrl}${normalizedPath}`, {
        ...requestInit,
        method,
        headers,
        signal: linked.signal,
        credentials: scope === "user" ? "include" : "omit"
      });
      const retryAfter = retryAfterSeconds(response);
      if (attempt < retries && isRetriableStatus(response.status, method)) {
        await response.text().catch(() => undefined);
        await delay(retryDelayMs(attempt + 1, retryAfter));
        continue;
      }
      return response;
    } catch (error) {
      if (requestInit.signal?.aborted) throw error;
      if (attempt >= retries || !isSafeMethod(method)) throw error;
      await delay(retryDelayMs(attempt + 1));
    } finally {
      linked.dispose();
    }
  }
  throw new Error("Mobile API request retry budget exhausted");
}

export function mobileApiFetch(path: string, init: MobileApiRequestInit = {}) {
  return scopedFetch("public", path, init);
}

export function mobileUserApiFetch(path: string, init: MobileApiRequestInit = {}) {
  return scopedFetch("user", path, init);
}

export function mobileAdminApiFetch(path: string, init: MobileApiRequestInit = {}) {
  return scopedFetch("admin", path, init);
}

export async function mobileApiJson<T>(
  scope: MobileRequestScope,
  path: string,
  init: MobileApiRequestInit = {}
): Promise<T> {
  const response = scope === "admin"
    ? await mobileAdminApiFetch(path, init)
    : scope === "user"
      ? await mobileUserApiFetch(path, init)
      : await mobileApiFetch(path, init);
  const body = await response.json().catch(() => null) as T | { error?: { code?: string; message?: string } } | null;
  if (response.ok) return body as T;
  const retryAfter = retryAfterSeconds(response);
  const payload = body && typeof body === "object" && "error" in body ? body.error : null;
  throw new MobileApiError({
    status: response.status,
    code: payload?.code || `HTTP_${response.status}`,
    message: payload?.message || (response.status >= 500 ? "Сервис временно недоступен." : `HTTP ${response.status}`),
    requestId: response.headers.get("x-prosmet-request-id") || "unknown",
    retriable: isRetriableStatus(response.status, init.method),
    retryAfterSeconds: retryAfter
  });
}
