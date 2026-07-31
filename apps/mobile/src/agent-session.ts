import * as SecureStore from "expo-secure-store";

const tokenKey = "prosmet.admin-token";
const baseUrlKey = "prosmet.api-base-url";
const defaultBaseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";

let cachedToken: string | null | undefined;
let cachedBaseUrl: string | undefined;

export async function getMobileAdminToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(tokenKey);
  return cachedToken;
}

export async function setMobileAdminToken(token: string | null) {
  cachedToken = token?.trim() || null;
  if (cachedToken) {
    await SecureStore.setItemAsync(tokenKey, cachedToken, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  } else {
    await SecureStore.deleteItemAsync(tokenKey);
  }
}

export async function getMobileApiBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  cachedBaseUrl = (await SecureStore.getItemAsync(baseUrlKey))?.replace(/\/+$/, "") || defaultBaseUrl.replace(/\/+$/, "");
  return cachedBaseUrl;
}

export async function setMobileApiBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  const url = new URL(normalized);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("API URL должен использовать http или https");
  cachedBaseUrl = normalized;
  await SecureStore.setItemAsync(baseUrlKey, normalized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function mobileApiFetch(path: string, init: RequestInit = {}) {
  const [baseUrl, token] = await Promise.all([getMobileApiBaseUrl(), getMobileAdminToken()]);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-prosmet-admin-token": token } : {}),
      ...init.headers
    }
  });
}
