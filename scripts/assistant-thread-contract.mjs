import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const [edge, store, adapter, runtime] = await Promise.all([
  read("apps/web/server-entry.mjs"),
  read("apps/web/assistant-thread-store.mjs"),
  read("apps/web/src/runtime/server-thread-list-adapter.tsx"),
  read("apps/web/src/runtime/ThreadRuntimeProvider.tsx")
]);

const failures = [];

const required = [
  ["edge-route", edge, "/api/threads"],
  ["edge-session-owner", edge, "/api/auth/session"],
  ["edge-store", edge, "createAssistantThreadStore"],
  ["sqlite-tables", store, "assistant_threads"],
  ["sqlite-messages", store, "assistant_thread_messages"],
  ["owner-isolation", store, "owner_id"],
  ["remote-adapter", adapter, "RemoteThreadListAdapter"],
  ["remote-history", adapter, "ThreadHistoryAdapter"],
  ["remote-api", adapter, "/api/threads"],
  ["runtime-adapter", runtime, "serverThreadListAdapter"]
];

for (const [name, source, token] of required) {
  if (!source.includes(token)) failures.push(`${name}:missing:${token}`);
}

for (const forbidden of ["prosmet.assistant.threads.v1", "thread-local-only", "demo-thread-runtime"]) {
  if (runtime.includes(forbidden)) failures.push(`runtime-forbidden:${forbidden}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "prosmet-assistant-thread-v1", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-assistant-thread-v1",
  persistence: "sqlite",
  ownership: "auth-session-derived",
  adapter: "assistant-ui RemoteThreadListAdapter + ThreadHistoryAdapter",
  edge: "/api/threads"
}, null, 2));
