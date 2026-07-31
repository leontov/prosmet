#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES: dict[str, str] = {
    "apps/mobile/package.json": r'''{
  "name": "@prosmet/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit",
    "doctor": "npx expo-doctor",
    "export:web": "expo export --platform web"
  },
  "dependencies": {
    "@assistant-ui/react-native": "latest",
    "expo": "^57.0.0",
    "expo-file-system": "latest",
    "expo-print": "latest",
    "expo-router": "latest",
    "expo-secure-store": "latest",
    "expo-sharing": "latest",
    "expo-sqlite": "latest",
    "expo-status-bar": "latest",
    "react": "19.2.3",
    "react-native": "0.86.0",
    "react-native-safe-area-context": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "typescript": "^5.9.3"
  }
}
''',
    "apps/mobile/app.json": r'''{
  "expo": {
    "name": "Просметчик",
    "slug": "prosmet",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "prosmet",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-sqlite"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "online.kolibriai.prosmet",
      "infoPlist": {
        "NSAppTransportSecurity": {
          "NSAllowsArbitraryLoads": false
        }
      }
    },
    "android": {
      "package": "online.kolibriai.prosmet",
      "adaptiveIcon": {
        "backgroundColor": "#f7f7f5"
      }
    },
    "web": {
      "bundler": "metro",
      "output": "static"
    },
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "router": {},
      "apiUrl": "https://kolibriai.online"
    }
  }
}
''',
    "apps/mobile/eas.json": r'''{
  "cli": {
    "version": ">= 17.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_PROSMET_API_URL": "https://kolibriai.online"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
''',
    "apps/mobile/tsconfig.json": r'''{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
''',
    "apps/mobile/expo-env.d.ts": r'''/// <reference types="expo/types" />
''',
    "apps/mobile/app/_layout.tsx": r'''import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </SafeAreaProvider>
  );
}
''',
    "apps/mobile/app/index.tsx": r'''import { AssistantRuntimeProvider } from "@assistant-ui/react-native";
import { NativeWorkspace } from "@/src/components/native-workspace";
import { useProsmetRuntime } from "@/src/runtime";

export default function HomeScreen() {
  const runtime = useProsmetRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NativeWorkspace />
    </AssistantRuntimeProvider>
  );
}
''',
    "apps/mobile/app/settings.tsx": r'''import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiBase, setApiBase } from "@/src/config";

export default function SettingsScreen() {
  const [url, setUrl] = useState("");
  const [identity, setIdentity] = useState<{ ownerId?: string; roles?: string[] } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getApiBase().then(async (base) => {
      setUrl(base);
      const response = await fetch(`${base}/api/identity`, { credentials: "include" }).catch(() => null);
      if (response?.ok) setIdentity(await response.json());
    });
  }, []);

  const save = async () => {
    await setApiBase(url);
    setMessage("Сервер сохранён в защищённом хранилище устройства.");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Link href="/" asChild><Pressable><Text style={styles.back}>‹ Чат</Text></Pressable></Link>
        <Text style={styles.title}>Настройки</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Сервер рабочего пространства</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          placeholder="https://kolibriai.online"
        />
        <Pressable style={styles.button} onPress={save}><Text style={styles.buttonText}>Сохранить</Text></Pressable>
        {message ? <Text style={styles.muted}>{message}</Text> : null}
        <View style={styles.divider} />
        <Text style={styles.label}>Идентификатор владельца</Text>
        <Text selectable style={styles.code}>{identity?.ownerId || "Будет создан после подключения"}</Text>
        <Text style={styles.muted}>Роли: {identity?.roles?.join(", ") || "обычный пользователь"}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f7f5" },
  header: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  back: { fontSize: 16, color: "#575752" },
  title: { fontSize: 17, fontWeight: "600", color: "#171716" },
  content: { padding: 20, gap: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#343431" },
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", borderRadius: 13, backgroundColor: "#fff", paddingHorizontal: 14, fontSize: 15, color: "#171716" },
  button: { height: 46, borderRadius: 13, backgroundColor: "#20201e", alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  muted: { color: "#73736d", fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#deded9", marginVertical: 10 },
  code: { borderRadius: 12, backgroundColor: "#ededeb", padding: 12, fontFamily: "monospace", color: "#343431" }
});
''',
    "apps/mobile/src/config.ts": r'''import Constants from "expo-constants";
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
''',
    "apps/mobile/src/storage/offline.ts": r'''import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  databasePromise ??= SQLite.openDatabaseAsync("prosmet-native-v1.db").then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS estimate_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    return db;
  });
  return databasePromise;
}

export async function saveEstimateDraft(id: string, payload: unknown, status = "draft") {
  const db = await database();
  await db.runAsync(
    `INSERT INTO estimate_drafts (id, payload_json, status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, status = excluded.status, updated_at = excluded.updated_at`,
    id, JSON.stringify(payload), status, new Date().toISOString()
  );
}

export async function enqueue(kind: string, payload: unknown) {
  const db = await database();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await db.runAsync(
    `INSERT INTO outbox (id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)`,
    id, kind, JSON.stringify(payload), new Date().toISOString()
  );
  return id;
}

export async function pendingOutbox() {
  const db = await database();
  return db.getAllAsync<{ id: string; kind: string; payload_json: string; attempts: number }>(
    `SELECT id, kind, payload_json, attempts FROM outbox ORDER BY created_at`
  );
}
''',
    "apps/mobile/src/runtime.ts": r'''import { useEffect, useMemo, useState } from "react";
import { type ChatModelAdapter, useLocalRuntime } from "@assistant-ui/react-native";
import { getApiBase } from "@/src/config";

type EventRecord = Record<string, unknown>;

function textContent(message: { content?: unknown }) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .flatMap((part) => part && typeof part === "object" && (part as EventRecord).type === "text" && typeof (part as EventRecord).text === "string" ? [(part as EventRecord).text as string] : [])
    .join("\n");
}

function createAdapter(apiBase: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const response = await fetch(`${apiBase}/api/agent`, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        credentials: "include",
        signal: abortSignal,
        body: JSON.stringify({
          threadId: `native-${Date.now()}`,
          runId: `native-run-${Date.now()}`,
          messages: messages.map((message, index) => ({
            id: String((message as EventRecord).id || `native-message-${index}`),
            role: (message as EventRecord).role,
            content: [{ type: "text", text: textContent(message as { content?: unknown }) }]
          })),
          tools: [],
          context: { client: "expo-native", platform: "mobile" },
          state: {}
        })
      });
      if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tools = new Map<string, { toolName: string; argsText: string }>();
      let text = "";
      let buffer = "";
      const content = () => [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...Array.from(tools.entries()).map(([toolCallId, tool]) => ({
          type: "tool-call" as const,
          toolCallId,
          toolName: tool.toolName,
          args: (() => { try { return JSON.parse(tool.argsText || "{}"); } catch { return {}; } })()
        }))
      ];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5).trim()) as EventRecord;
            if (event.type === "TEXT_MESSAGE_CONTENT") {
              text += typeof event.delta === "string" ? event.delta : typeof event.content === "string" ? event.content : "";
            }
            if (event.type === "TOOL_CALL_START" && typeof event.toolCallId === "string") {
              tools.set(event.toolCallId, { toolName: String(event.toolCallName || event.toolName || "tool"), argsText: "" });
            }
            if (event.type === "TOOL_CALL_ARGS" && typeof event.toolCallId === "string") {
              const tool = tools.get(event.toolCallId);
              if (tool) tool.argsText += String(event.delta || event.args || "");
            }
            if (event.type === "RUN_ERROR") throw new Error(String(event.message || "Ошибка агента"));
            yield { content: content() };
          }
        }
      }
      yield { content: content() };
    }
  };
}

export function useProsmetRuntime() {
  const [apiBase, setApiBase] = useState("https://kolibriai.online");
  useEffect(() => { void getApiBase().then(setApiBase); }, []);
  const adapter = useMemo(() => createAdapter(apiBase), [apiBase]);
  return useLocalRuntime(adapter);
}
''',
    "apps/mobile/src/components/estimate-card.tsx": r'''import { useMemo, useState } from "react";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiBase } from "@/src/config";
import { enqueue, saveEstimateDraft } from "@/src/storage/offline";

type Item = { id: string; name?: string; unit?: string; quantity?: number; norm?: number; coefficient?: number; unitPrice?: number };
type Section = { id: string; title?: string; items?: Item[] };
type Draft = { id?: string; title?: string; objectName?: string; customerName?: string; sections?: Section[]; overheadPercent?: number; profitPercent?: number; discountPercent?: number; vatPercent?: number };

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function calculate(draft: Draft) {
  const direct = money((draft.sections || []).flatMap((section) => section.items || []).reduce((sum, item) => sum + money(money(Number(item.quantity || 0)) * Number(item.norm ?? 1) * Number(item.coefficient ?? 1) * Number(item.unitPrice || 0)), 0));
  const overhead = money(direct * Number(draft.overheadPercent || 0) / 100);
  const profit = money((direct + overhead) * Number(draft.profitPercent || 0) / 100);
  const discount = money((direct + overhead + profit) * Number(draft.discountPercent || 0) / 100);
  const subtotal = money(direct + overhead + profit - discount);
  const vat = money(subtotal * Number(draft.vatPercent || 0) / 100);
  return money(subtotal + vat);
}
function rub(value: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char)); }

export function NativeEstimateCard({ args }: { args: unknown }) {
  const original = (args && typeof args === "object" ? args : {}) as Draft;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(original);
  const [message, setMessage] = useState("");
  const total = useMemo(() => calculate(draft), [draft]);
  const items = draft.sections?.flatMap((section) => section.items || []) || [];

  const updateItem = (id: string, patch: Partial<Item>) => setDraft((current) => ({
    ...current,
    sections: (current.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => item.id === id ? { ...item, ...patch } : item)
    }))
  }));

  const save = async () => {
    const id = draft.id || `native-estimate-${Date.now()}`;
    const next = { ...draft, id };
    setDraft(next);
    await saveEstimateDraft(id, next);
    await enqueue("estimate_upsert", next);
    setMessage("Черновик сохранён на устройстве и поставлен в очередь синхронизации.");
  };

  const approve = async () => {
    const apiBase = await getApiBase();
    const response = await fetch(`${apiBase}/api/engine/calculate`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(draft)
    });
    const result = await response.json();
    if (!response.ok || result.engine !== "rust") throw new Error(result.message || "Rust-движок не подтвердил расчёт");
    await saveEstimateDraft(draft.id || `native-estimate-${Date.now()}`, { ...draft, engineDigest: result.digest }, "approved");
    setMessage(`Утверждено Rust ${result.engineVersion}. Итог ${rub(result.calculation.total)}.`);
  };

  const sharePdf = async () => {
    const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.name || "Позиция")}</td><td>${escapeHtml(item.unit || "")}</td><td>${item.quantity || 0}</td><td>${item.unitPrice || 0}</td></tr>`).join("");
    const html = `<html><body style="font-family:-apple-system;padding:32px"><h1>${escapeHtml(draft.title || "Смета")}</h1><p>${escapeHtml(draft.objectName || "")}</p><table width="100%" cellspacing="0" cellpadding="8" border="1"><tr><th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th></tr>${rows}</table><h2 style="text-align:right">Итого: ${rub(total)}</h2></body></html>`;
    const file = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Передать смету" });
  };

  return (
    <>
      <Pressable style={styles.card} onPress={() => setOpen(true)}>
        <Text style={styles.eyebrow}>СМЕТА</Text>
        <Text style={styles.title}>{draft.title || "Черновик сметы"}</Text>
        <View style={styles.row}><Text style={styles.muted}>{items.length} позиций</Text><Text style={styles.total}>{rub(total)}</Text></View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpen(false)}><Text style={styles.close}>Закрыть</Text></Pressable>
            <Text style={styles.headerTitle}>Смета</Text>
            <Pressable onPress={save}><Text style={styles.save}>Сохранить</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <TextInput style={styles.documentTitle} value={draft.title || ""} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} placeholder="Название сметы" />
            <TextInput style={styles.metaInput} value={draft.objectName || ""} onChangeText={(objectName) => setDraft((current) => ({ ...current, objectName }))} placeholder="Объект" />
            {items.map((item, index) => (
              <View key={item.id} style={styles.item}>
                <Text style={styles.itemIndex}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name || "Позиция"}</Text>
                  <View style={styles.inputs}>
                    <TextInput style={styles.numberInput} keyboardType="decimal-pad" value={String(item.quantity || 0)} onChangeText={(value) => updateItem(item.id, { quantity: Number(value.replace(",", ".")) || 0 })} />
                    <Text style={styles.unit}>{item.unit || "ед."}</Text>
                    <TextInput style={styles.numberInput} keyboardType="decimal-pad" value={String(item.unitPrice || 0)} onChangeText={(value) => updateItem(item.id, { unitPrice: Number(value.replace(",", ".")) || 0 })} />
                    <Text style={styles.unit}>₽</Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={styles.summary}><Text style={styles.summaryLabel}>Итого</Text><Text style={styles.summaryValue}>{rub(total)}</Text></View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Pressable style={styles.primary} onPress={() => void approve().catch((error) => setMessage(error.message))}><Text style={styles.primaryText}>Утвердить через Rust</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => void sharePdf()}><Text style={styles.secondaryText}>Передать PDF</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d4d4cf", borderRadius: 16, backgroundColor: "#fafaf9", padding: 16, gap: 7 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, color: "#787872", fontWeight: "700" },
  title: { fontSize: 16, lineHeight: 22, color: "#1b1b19", fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  muted: { color: "#73736d", fontSize: 13 },
  total: { color: "#1b1b19", fontSize: 15, fontWeight: "650" },
  modalRoot: { flex: 1, backgroundColor: "#f7f7f5" },
  modalHeader: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#d9d9d4" },
  close: { color: "#62625d", fontSize: 15 },
  save: { color: "#1b1b19", fontSize: 15, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "600" },
  content: { padding: 18, gap: 12, paddingBottom: 44 },
  documentTitle: { fontSize: 24, fontWeight: "650", color: "#171716", paddingVertical: 8 },
  metaInput: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", fontSize: 15 },
  item: { flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  itemIndex: { width: 22, color: "#8a8a83" },
  itemName: { color: "#252523", fontSize: 15, lineHeight: 21 },
  inputs: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  numberInput: { minWidth: 68, height: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", backgroundColor: "#fff", textAlign: "right", paddingHorizontal: 9 },
  unit: { color: "#73736d", fontSize: 12 },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 18 },
  summaryLabel: { fontSize: 17, fontWeight: "600" },
  summaryValue: { fontSize: 19, fontWeight: "700" },
  message: { color: "#62625d", fontSize: 13, lineHeight: 19 },
  primary: { height: 50, backgroundColor: "#20201e", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondary: { height: 50, borderWidth: StyleSheet.hairlineWidth, borderColor: "#bdbdb7", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#292927", fontSize: 15, fontWeight: "600" }
});
''',
    "apps/mobile/src/components/native-thread.tsx": r'''import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from "@assistant-ui/react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeEstimateCard } from "@/src/components/estimate-card";

function UserMessage() {
  return (
    <MessagePrimitive.Root style={styles.userRoot}>
      <View style={styles.userBubble}>
        <MessagePrimitive.Content renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>} />
      </View>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root style={styles.assistantRoot}>
      <View style={styles.avatar}><Text style={styles.avatarText}>П</Text></View>
      <View style={styles.assistantContent}>
        <MessagePrimitive.Content
          renderText={({ part }) => <Text style={styles.assistantText}>{part.text}</Text>}
          renderToolCall={({ part }) => {
            const value = part as unknown as { toolName?: string; args?: unknown };
            return value.toolName === "estimate_draft"
              ? <NativeEstimateCard args={value.args} />
              : <View style={styles.tool}><Text style={styles.toolText}>{value.toolName || "Инструмент"}</Text></View>;
          }}
        />
      </View>
    </MessagePrimitive.Root>
  );
}

export function NativeThread() {
  return (
    <ThreadPrimitive.Root style={styles.root}>
      <AuiIf condition={(state) => state.thread.isEmpty}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Что нужно сделать?</Text>
          <Text style={styles.emptyText}>Опишите объект, работу или документ. Ассистент соберёт технологию, расчёт и результат.</Text>
          {[
            "Смета механизированной штукатурки 358 м², Татарстан",
            "Рассчитать ремонт квартиры и подготовить КП",
            "Создать договор и акт из утверждённой сметы"
          ].map((prompt) => (
            <ThreadPrimitive.Suggestion key={prompt} prompt={prompt} send style={styles.suggestion}>
              <Text style={styles.suggestionText}>{prompt}</Text>
            </ThreadPrimitive.Suggestion>
          ))}
        </View>
      </AuiIf>
      <ThreadPrimitive.MessagesFlatList
        autoScroll
        contentContainerStyle={styles.messages}
        components={{ UserMessage, AssistantMessage }}
      />
      <View style={styles.composerWrap}>
        <ComposerPrimitive.Root style={styles.composer}>
          <ComposerPrimitive.Input multiline placeholder="Сообщение Просметчику" placeholderTextColor="#92928b" style={styles.input} />
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send style={styles.send}><Text style={styles.sendText}>↑</Text></ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel style={styles.send}><View style={styles.stop} /></ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
        <Text style={styles.disclaimer}>ИИ может ошибаться. Расчёт утверждается серверным Rust-движком.</Text>
      </View>
    </ThreadPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  messages: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 150 },
  empty: { flex: 1, justifyContent: "center", paddingVertical: 70, gap: 12 },
  emptyTitle: { fontSize: 27, fontWeight: "650", letterSpacing: -0.6, color: "#171716", textAlign: "center", marginBottom: 2 },
  emptyText: { fontSize: 15, lineHeight: 22, color: "#6d6d67", textAlign: "center", marginBottom: 12 },
  suggestion: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#d7d7d2", backgroundColor: "#fbfbfa", borderRadius: 15, paddingHorizontal: 15, paddingVertical: 13 },
  suggestionText: { color: "#30302d", fontSize: 14, lineHeight: 20 },
  userRoot: { alignItems: "flex-end", marginVertical: 8 },
  userBubble: { maxWidth: "86%", backgroundColor: "#ededeb", borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 15, paddingVertical: 11 },
  userText: { fontSize: 15, lineHeight: 21, color: "#20201e" },
  assistantRoot: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 10 },
  avatar: { width: 28, height: 28, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d1d1cc", alignItems: "center", justifyContent: "center", backgroundColor: "#fafaf9" },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#555550" },
  assistantContent: { flex: 1, paddingTop: 2 },
  assistantText: { fontSize: 15, lineHeight: 23, color: "#242422" },
  tool: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#d7d7d2", padding: 12, borderRadius: 14, marginTop: 8 },
  toolText: { color: "#676761", fontSize: 13 },
  composerWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: "rgba(247,247,245,0.97)" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, minHeight: 54, maxHeight: 140, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", backgroundColor: "#fff", padding: 8, paddingLeft: 14 },
  input: { flex: 1, minHeight: 38, maxHeight: 120, fontSize: 15, lineHeight: 21, color: "#20201e", paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#232321", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 21, lineHeight: 23 },
  stop: { width: 11, height: 11, borderRadius: 2, backgroundColor: "#fff" },
  disclaimer: { fontSize: 10, color: "#93938c", textAlign: "center", marginTop: 7 }
});
''',
    "apps/mobile/src/components/native-workspace.tsx": r'''import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { NativeThread } from "@/src/components/native-thread";
import { getApiBase } from "@/src/config";

type Manifest = { productName?: string; organizationName?: string; modules?: string[] };

export function NativeWorkspace() {
  const [manifest, setManifest] = useState<Manifest>({ productName: "Просметчик" });
  useEffect(() => {
    void getApiBase().then((base) => fetch(`${base}/api/client-manifest`, { credentials: "include" }))
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => payload?.manifest && setManifest(payload.manifest))
      .catch(() => undefined);
  }, []);
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>П</Text></View>
          <View><Text style={styles.title}>{manifest.productName || "Просметчик"}</Text><Text style={styles.subtitle}>{manifest.organizationName || "Универсальный ассистент"}</Text></View>
        </View>
        <Link href="/settings" asChild><Pressable style={styles.settings} accessibilityLabel="Настройки"><Text style={styles.settingsText}>•••</Text></Pressable></Link>
      </View>
      <NativeThread />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f7f5" },
  header: { height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#232321", alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  title: { color: "#171716", fontSize: 15, fontWeight: "650" },
  subtitle: { color: "#85857e", fontSize: 10, marginTop: 1 },
  settings: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  settingsText: { color: "#63635e", fontSize: 17, letterSpacing: 1 }
});
''',
    "apps/mobile/README.md": r'''# Prosmet Native

Expo SDK 57 / React Native 0.86 application for iOS, Android and native web. It uses `@assistant-ui/react-native`, the same AG-UI backend as the web app, native SQLite for offline drafts/outbox, SecureStore for server configuration, native PDF generation/sharing, and the server Rust approval gate.

```bash
npm install
npm run typecheck
npm run ios
npm run android
```

Production builds are created with EAS profiles from `eas.json`. Store submission requires the owner's Expo, Apple Developer and Google Play credentials.
''',
    "apps/desktop/package.json": r'''{
  "name": "@prosmet/desktop",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build:web": "node scripts/build-web.mjs",
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.8.0"
  }
}
''',
    "apps/desktop/scripts/build-web.mjs": r'''import { mkdir, writeFile } from "node:fs/promises";
await mkdir(new URL("../dist", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/index.html", import.meta.url), `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Просметчик</title>
<style>html,body{height:100%;margin:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20201e}.root{height:100%;display:grid;place-items:center}.mark{width:42px;height:42px;border-radius:14px;background:#232321;color:white;display:grid;place-items:center;font-weight:700;margin:auto}.muted{color:#777770;font-size:13px;margin-top:14px}</style></head>
<body><div class="root"><div><div class="mark">П</div><div class="muted">Открываем защищённое рабочее пространство…</div></div></div>
<script>const origin=localStorage.getItem("prosmet.origin")||"https://kolibriai.online";location.replace(origin);</script></body></html>`);
''',
    "apps/desktop/src-tauri/Cargo.toml": r'''[package]
name = "prosmet-desktop"
version = "1.0.0"
description = "Prosmet universal desktop assistant"
authors = ["Prosmet"]
edition = "2024"

[lib]
name = "prosmet_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[[bin]]
name = "prosmet-desktop"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
prosmet-engine = { path = "../../../crates/prosmet-engine" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
''',
    "apps/desktop/src-tauri/build.rs": r'''fn main() {
    tauri_build::build()
}
''',
    "apps/desktop/src-tauri/src/lib.rs": r'''use prosmet_engine::{EstimateInput, calculate_estimate};
use serde_json::Value;

#[tauri::command]
fn calculate_estimate_native(input: Value) -> Result<Value, String> {
    let estimate: EstimateInput = serde_json::from_value(input).map_err(|error| error.to_string())?;
    let result = calculate_estimate(&estimate).map_err(|error| error.to_string())?;
    serde_json::to_value(result).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![calculate_estimate_native])
        .setup(|app| {
            let origin = std::env::var("PROSMET_DESKTOP_ORIGIN").unwrap_or_else(|_| "https://kolibriai.online".to_owned());
            let url = tauri::Url::parse(&origin)?;
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("Просметчик")
                .inner_size(1440.0, 900.0)
                .min_inner_size(980.0, 640.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Prosmet desktop");
}
''',
    "apps/desktop/src-tauri/src/main.rs": r'''fn main() {
    prosmet_desktop_lib::run();
}
''',
    "apps/desktop/src-tauri/tauri.conf.json": r'''{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Просметчик",
  "version": "1.0.0",
  "identifier": "online.kolibriai.prosmet.desktop",
  "build": {
    "beforeBuildCommand": "npm run build:web",
    "beforeDevCommand": "npm run build:web",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src https://kolibriai.online; img-src 'self' data: https:"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "category": "Business",
    "shortDescription": "Универсальный AI-ассистент и профессиональная сметная система",
    "longDescription": "Просметчик объединяет чат, сметы, документы, каталог цен и подключаемых агентов в лаконичном рабочем пространстве."
  }
}
''',
    "apps/desktop/src-tauri/capabilities/default.json": r'''{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Minimal local capability set. Remote production pages receive no Tauri IPC permissions.",
  "windows": ["main"],
  "permissions": ["core:default"]
}
''',
    "apps/desktop/README.md": r'''# Prosmet Desktop

Tauri 2 shell for macOS, Windows and Linux. It opens only the configured Prosmet HTTPS origin and does not grant remote pages Tauri IPC permissions. The bundled Rust core exposes the same deterministic calculation engine for future fully-offline desktop workflows.

```bash
npm install
npm run dev
npm run build
```

Code signing and notarization credentials are intentionally supplied only through release CI secrets.
''',
    "docs/STORE_RELEASE.md": r'''# Store and desktop release

## iOS and Android

The native app is in `apps/mobile` and targets Expo SDK 57 / React Native 0.86.

```bash
cd apps/mobile
npm install
npx eas-cli login
npx eas-cli build --profile production --platform ios
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Required owner-controlled credentials:

- Expo/EAS account and project registration;
- Apple Developer membership, App Store Connect app record, signing certificate/profile or managed credentials;
- Google Play Console app record and service-account JSON with release permission;
- final privacy-policy/support URLs and store metadata.

CI accepts these only as encrypted repository/environment secrets. They are never committed.

## Desktop

```bash
cd apps/desktop
npm install
npm run build
```

Unsigned development bundles can be built automatically. Public macOS distribution requires Apple signing/notarization credentials; Windows public distribution requires a code-signing certificate; Linux packages can be generated without a commercial signing identity.

## Release gate

A store release is accepted only when the web quality suite, Rust parity tests, native typecheck/Expo Doctor, Tauri compile, tenant isolation, privacy metadata, store screenshots and signed upload all pass against one version tag.
''',
    "docs/PRODUCT_POSITIONING.md": r'''# Product positioning

Prosmet is an assistant-first operating system for project work, starting with professional construction estimates and documents. Unlike form-heavy legacy products, the user describes a goal in natural language; a tenant-configured virtual office turns it into auditable technology, resources, prices, estimates and documents.

The platform is deliberately universal:

- one calm GPT-like shell;
- tenant manifests select modules and terminology;
- any agent can connect through AG-UI, A2A, Codex App Server, OpenAI-compatible APIs or Ollama;
- deterministic Rust calculations remain independent of the language model;
- approved user prices become organization knowledge with provenance;
- web, iOS, Android and Tauri desktop share one backend and one product model.

This gives the product a defensible combination of workflow data, price intelligence, agent interoperability and regulated calculation discipline while preserving a consumer-grade interface.
''',
    "docs/images/universal-platform.svg": r'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="760" viewBox="0 0 1440 760">
<rect width="1440" height="760" rx="28" fill="#f5f5f2"/><rect x="28" y="28" width="276" height="704" rx="20" fill="#ecece8"/><circle cx="67" cy="70" r="18" fill="#20201e"/><text x="61" y="76" fill="#fff" font-family="Arial" font-size="16" font-weight="700">П</text><text x="97" y="77" fill="#20201e" font-family="Arial" font-size="20" font-weight="700">Просметчик</text>
<g font-family="Arial" font-size="15" fill="#484844"><rect x="46" y="118" width="240" height="46" rx="12" fill="#deded9"/><text x="70" y="147">Новый чат</text><text x="70" y="205">Чаты</text><text x="70" y="249">Объекты</text><text x="70" y="293">Сметы</text><text x="70" y="337">Документы</text><text x="70" y="381">Цены</text></g>
<rect x="328" y="28" width="1084" height="704" rx="20" fill="#fff"/><text x="374" y="88" fill="#20201e" font-family="Arial" font-size="26" font-weight="700">Что нужно сделать?</text><text x="374" y="122" fill="#777770" font-family="Arial" font-size="15">Чат, расчёт и документы в одном спокойном рабочем пространстве</text>
<rect x="430" y="174" width="614" height="76" rx="19" fill="#ededeb"/><text x="460" y="207" fill="#292927" font-family="Arial" font-size="15">Составь смету механизированной штукатурки 358 м².</text><text x="460" y="231" fill="#777770" font-family="Arial" font-size="13">Сначала технологическая карта, затем расчёт и документы.</text>
<circle cx="391" cy="303" r="17" fill="#20201e"/><text x="385" y="309" fill="#fff" font-family="Arial" font-size="13" font-weight="700">П</text><text x="430" y="299" fill="#292927" font-family="Arial" font-size="15">Подготовил технологию и черновик. Итог подтверждается Rust-движком.</text>
<rect x="430" y="329" width="902" height="246" rx="18" fill="#fafaf9" stroke="#d7d7d2"/><text x="462" y="370" fill="#20201e" font-family="Arial" font-size="18" font-weight="700">Смета: механизированная штукатурка</text><text x="1192" y="370" fill="#20201e" font-family="Arial" font-size="18" font-weight="700">536 420 ₽</text><line x1="462" y1="395" x2="1300" y2="395" stroke="#deded9"/><g font-family="Arial" font-size="14" fill="#454541"><text x="462" y="430">Механизированная штукатурка стен</text><text x="1130" y="430">358 м²</text><text x="1240" y="430">186 160 ₽</text><text x="462" y="470">Грунтование, маяки и углы</text><text x="1130" y="470">компл.</text><text x="1240" y="470">74 260 ₽</text><text x="462" y="510">Материалы, доставка и подъём</text><text x="1130" y="510">компл.</text><text x="1240" y="510">276 000 ₽</text></g><line x1="462" y1="536" x2="1300" y2="536" stroke="#deded9"/><text x="462" y="559" fill="#777770" font-family="Arial" font-size="12">Rust 1.0 · SHA-256 verified · версия 4</text>
<rect x="374" y="630" width="920" height="64" rx="20" fill="#fff" stroke="#cfcfca"/><text x="402" y="668" fill="#91918b" font-family="Arial" font-size="15">Сообщение Просметчику</text><rect x="1238" y="642" width="42" height="42" rx="14" fill="#20201e"/><text x="1251" y="672" fill="#fff" font-family="Arial" font-size="24">↑</text>
</svg>
''',
    ".github/workflows/universal-quality.yml": r'''name: Prosmet Universal Platform

on:
  pull_request:
    branches: [main]
    paths:
      - "crates/**"
      - "apps/mobile/**"
      - "apps/desktop/**"
      - "lib/server/engine/**"
      - "lib/server/agents/**"
      - "app/api/engine/**"
      - "Cargo.toml"
      - ".github/workflows/universal-quality.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  rust-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo test -p prosmet-engine --all-targets
      - run: cargo clippy -p prosmet-engine --all-targets -- -D warnings
      - run: cargo build --release -p prosmet-engine
      - run: echo '{"sections":[]}' | target/release/prosmet-engine-cli | grep '"engine":"rust"'

  native-mobile:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.16.0"
          cache: npm
          cache-dependency-path: apps/mobile/package-lock.json
      - run: npm ci --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run doctor
      - run: npm run export:web
        env:
          EXPO_PUBLIC_PROSMET_API_URL: https://kolibriai.online

  desktop-tauri:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.16.0"
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Linux system dependencies
        if: matrix.os == 'ubuntu-24.04'
        run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - run: npm ci --prefix apps/desktop --no-audit --no-fund
      - run: npm run build:web --prefix apps/desktop
      - run: cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

  source-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.16.0"
          cache: npm
      - run: npm ci --no-audit --no-fund
      - run: npm run universal:contract
      - run: npm run typecheck
''',
    ".github/workflows/mobile-release.yml": r'''name: Prosmet Native Store Release

on:
  workflow_dispatch:
    inputs:
      platform:
        type: choice
        options: [all, ios, android]
        default: all
      submit:
        type: boolean
        default: false

permissions:
  contents: read

environment: mobile-production

jobs:
  eas:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.16.0"
          cache: npm
          cache-dependency-path: apps/mobile/package-lock.json
      - run: npm ci --no-audit --no-fund
      - run: npm run typecheck && npm run doctor
      - run: npx eas-cli build --non-interactive --profile production --platform ${{ inputs.platform }}
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      - if: inputs.submit
        run: npx eas-cli submit --non-interactive --profile production --platform ${{ inputs.platform }} --latest
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          EXPO_APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.EXPO_APPLE_APP_SPECIFIC_PASSWORD }}
          EXPO_ASC_API_KEY_PATH: ${{ secrets.EXPO_ASC_API_KEY_PATH }}
          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
''',
    ".github/workflows/desktop-release.yml": r'''name: Prosmet Desktop Release

on:
  push:
    tags: ["desktop-v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target universal-apple-darwin
          - platform: ubuntu-24.04
            args: ""
          - platform: windows-latest
            args: ""
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.16.0"
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin
      - name: Linux system dependencies
        if: matrix.platform == 'ubuntu-24.04'
        run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - run: npm ci --prefix apps/desktop --no-audit --no-fund
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: apps/desktop
          tagName: desktop-v__VERSION__
          releaseName: Просметчик Desktop v__VERSION__
          releaseBody: Cross-platform desktop release generated from a verified tag.
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
''',
    "README.md": r'''<div align="center">
  <img src="docs/images/universal-platform.svg" alt="Просметчик — универсальное приложение" width="100%" />

# Просметчик

### Универсальный assistant-first продукт для смет, документов, цен и подключаемых AI-агентов

[![Web Production](https://github.com/leontov/prosmet/actions/workflows/launch-3200.yml/badge.svg)](https://github.com/leontov/prosmet/actions/workflows/launch-3200.yml)
[![Universal Platform](https://github.com/leontov/prosmet/actions/workflows/universal-quality.yml/badge.svg)](https://github.com/leontov/prosmet/actions/workflows/universal-quality.yml)
[![PR Quality](https://github.com/leontov/prosmet/actions/workflows/pr-quality.yml/badge.svg)](https://github.com/leontov/prosmet/actions/workflows/pr-quality.yml)

**Web · iOS · Android · macOS · Windows · Linux**

</div>

## Продукт

Просметчик превращает обычный диалог в профессиональный рабочий результат: технологическую карту, ресурсную ведомость, смету, коммерческое предложение, договор, счёт и акт. Интерфейс остаётся лаконичным и GPT-like; сложность расчётов, синхронизации и агентной фабрики скрыта за чатом и открывается только по задаче.

Это не жёстко прошитая «строительная форма». Каждый клиент получает tenant-манифест с нужными модулями, терминологией и правами. Та же платформа может стать виртуальной сметной конторой, проектным офисом, сервисным приложением или отраслевым помощником.

## Платформы

| Поверхность | Технология | Назначение |
|---|---|---|
| Web | Next.js 16, React 19, assistant-ui, AG-UI | Основное рабочее пространство и администрирование |
| iOS / Android | Expo SDK 57, React Native 0.86, assistant-ui native | Замер, чат, редактирование, offline SQLite, PDF/share |
| Desktop | Tauri 2 + Rust | Защищённая оболочка для macOS, Windows и Linux |
| Calculation | Rust `prosmet-engine` | Авторитетный детерминированный расчёт и SHA-256 digest |
| Data | PostgreSQL + IndexedDB / SQLite outbox | Общая база и local-first работа |
| Agents | Codex App Server, A2A v1, AG-UI, OpenAI-compatible, Ollama | Единый подключаемый контур агентов |

## Ключевой пользовательский путь

```text
сообщение → технология → ресурсы → смета → редактирование → Rust-проверка
→ утверждённая версия → КП / договор / счёт / акт → PDF/XLSX → передача клиенту
```

- цены имеют регион, дату, источник, статус и историю;
- утверждённые цены становятся опытом пользователя/организации;
- каждый документ связан с неизменяемой версией сметы;
- offline-правки попадают в outbox и синхронизируются с PostgreSQL;
- AI интерпретирует задачу, но не подменяет детерминированный расчёт.

## Архитектура

```mermaid
flowchart LR
  U[Пользователь] --> W[Web assistant-ui]
  U --> N[Expo Native]
  U --> D[Tauri Desktop]
  W & N & D --> G[AG-UI Gateway]
  G --> R[Agent Router]
  R --> C[Codex App Server]
  R --> A[A2A agents]
  R --> O[OpenAI-compatible / MiMo]
  R --> L[Ollama]
  W & N & D --> E[Rust Estimate Engine]
  E --> P[(PostgreSQL)]
  W --> I[(IndexedDB)]
  N --> S[(SQLite)]
```

Подробности: [`docs/UNIVERSAL_ARCHITECTURE.md`](docs/UNIVERSAL_ARCHITECTURE.md).

## Репозиторий

```text
app/                         Next.js routes and APIs
components/                  premium GPT-like web surface
lib/domain/                  deterministic product contracts
lib/server/agents/           Codex, A2A, AG-UI and provider adapters
crates/prosmet-engine/       authoritative Rust engine
apps/mobile/                 Expo iOS / Android application
apps/desktop/                Tauri desktop application
deployment/                  PostgreSQL, immutable deploy, HTTPS
docs/                        architecture, security, product and release gates
```

## Запуск

### Web

```bash
npm ci
bash deployment/provision-postgres.sh
source "$HOME/.prosmet/database.env"
node deployment/migrate-postgres.mjs
npm run engine:build
npm run dev
```

### Native

```bash
cd apps/mobile
npm ci
npm run typecheck
npm run ios       # macOS + Xcode
npm run android   # Android SDK / emulator
```

### Desktop

```bash
cd apps/desktop
npm ci
npm run dev
```

## Проверка качества

```bash
npm run source:contract
npm run typecheck
npm run test
npm run build
npm run e2e
npm run engine:test
npm run mobile:typecheck
npm run desktop:check
```

`main` разворачивается только как неизменяемый релиз на Primary: PostgreSQL migration → source contract → typecheck → unit → production build → Chromium desktop/mobile → deploy 3200 → live smoke → HTTPS verification.

## Супер-администратор

Первый супер-администратор привязывается к уже созданной browser identity одной командой на Primary:

```bash
source "$HOME/.prosmet/database.env"
npm run admin:bootstrap -- \
  --owner 'guest:OWNER_FROM_API_IDENTITY' \
  --email 'owner@example.com'
```

Полная инструкция: [`docs/SUPERADMIN.md`](docs/SUPERADMIN.md). Изменение AI-провайдеров и tenant-манифеста в production разрешено только `super_admin`.

## Релизы в магазины

Конфигурации EAS и Tauri CI находятся в репозитории. Подписанный upload требует владельческих Apple/Google/Expo/Windows credentials, которые передаются только как encrypted environment secrets. См. [`docs/STORE_RELEASE.md`](docs/STORE_RELEASE.md).

## Безопасность и данные

- provider secrets: AES-256-GCM на сервере, никогда не возвращаются клиенту;
- tenant isolation: каждый запрос и sync-объект ограничен owner/tenant;
- внешний provider endpoint: HTTPS, кроме явно разрешённого локального Ollama;
- Rust binary запускается без shell, с ограниченным окружением, timeout и лимитом вывода;
- production CSP запрещает `unsafe-eval` и browser WASM;
- удаление чата не уничтожает подтверждённое ценовое знание организации;
- audit events фиксируют административные и ценовые изменения.

## Инвестиционный тезис

Просметчик соединяет четыре трудно копируемых слоя: consumer-grade диалоговый UX, проверяемый отраслевой расчёт, постоянно улучшающуюся базу цен/норм и нейтральную фабрику подключаемых агентов. Это позволяет конкурировать с тяжёлыми desktop-сметчиками качеством результата, но выигрывать скоростью внедрения, мобильностью и автоматизацией полного документооборота.

## Лицензия

Proprietary. Все права на продукт и исходный код сохраняются владельцем проекта.
'''
}


def write_files() -> None:
    for relative, content in FILES.items():
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.rstrip() + "\n", encoding="utf-8")


def main() -> None:
    write_files()
    print(json.dumps({"ok": True, "files": len(FILES), "phase": "universal-clients"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
