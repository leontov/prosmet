import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const KEY = "prosmet.api-url";
const FALLBACK = process.env.EXPO_PUBLIC_PROSMET_API_URL
  || (Constants.expoConfig?.extra?.apiUrl as string | undefined)
  || "https://kolibriai.online";

export async function getApiBase() {
  const stored = await SecureStore.getItemAsync(KEY);
  return (stored || FALLBACK).replace(/\/$/, "");
}

export async function setApiBase(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("Для удалённого сервера требуется HTTPS.");
  }
  const normalized = parsed.toString().replace(/\/$/, "");
  await SecureStore.setItemAsync(KEY, normalized);
  return normalized;
}
