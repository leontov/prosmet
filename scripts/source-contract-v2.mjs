import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFile(resolve(root, path), "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};

const required = [
  "app/page.tsx",
  "app/MyRuntimeProvider.tsx",
  "app/api/agent/route.ts",
  "app/api/sync/route.ts",
  "components/app/chat-workspace.tsx",
  "components/app/right-inspector.tsx",
  "components/chat/prosmet-thread.tsx",
  "components/tools/estimate-editor.tsx",
  "components/tools/document-editor.tsx",
  "lib/local/idb.ts",
  "lib/local/repository.ts",
  "lib/local/files.ts",
  "lib/local/sync.ts",
  "lib/server/postgres.ts",
  "deployment/provision-postgres.sh",
  "deployment/direct-primary.sh"
];
for (const path of required) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const page = await read("app/page.tsx");
need(page, 'export const dynamic = "force-dynamic"', "page");
need(page, "export const revalidate = 0", "page");

const runtime = await read("app/MyRuntimeProvider.tsx");
for (const token of [
  "HttpAgent",
  "useAgUiRuntime",
  "AssistantRuntimeProvider",
  "ProsmetAttachmentAdapter",
  "ThreadHistoryAdapter"
]) {
  need(runtime, token, "assistant-ui-runtime");
}
for (const token of [
  "useLocalRuntime",
  "localStorage",
  "runtime.thread.subscribe",
  "[workspace]"
]) {
  forbid(runtime, token, "assistant-ui-runtime");
}

const agent = await read("app/api/agent/route.ts");
for (const token of [
  "RUN_STARTED",
  "TEXT_MESSAGE_CONTENT",
  "TOOL_CALL_ARGS",
  "ACTIVITY_SNAPSHOT",
  "messageId: activityMessageId",
  "RUN_FINISHED",
  "text/event-stream"
]) {
  need(agent, token, "ag-ui");
}

const idb = await read("lib/local/idb.ts");
for (const token of [
  "prosmet-cache-v3",
  "indexedDB.open",
  "threads",
  "messages",
  "estimates",
  "estimateRevisions",
  "documents",
  "documentRevisions",
  "prices",
  "files",
  "outbox",
  "syncState",
  "withLocalTransaction"
]) {
  need(idb, token, "indexeddb");
}
for (const token of ["sql.js", "WebAssembly", "wasm"]) {
  forbid(idb, token, "indexeddb");
}

for (const path of ["lib/local/repository.ts", "lib/local/files.ts", "lib/local/sync.ts"]) {
  const source = await read(path);
  need(source, "LOCAL_STORES", path);
  for (const token of ["getDatabase", "sql.js", "sqlite.run", "localStorage"]) {
    forbid(source, token, path);
  }
}

const postgres = await read("lib/server/postgres.ts");
for (const token of [
  "Pool",
  "DATABASE_URL",
  "prosmet_threads",
  "prosmet_messages",
  "prosmet_estimates",
  "prosmet_estimate_revisions",
  "prosmet_documents",
  "prosmet_document_revisions",
  "prosmet_prices",
  "prosmet_files",
  "prosmet_agent_runs",
  "withServerTransaction"
]) {
  need(postgres, token, "postgres");
}
for (const token of [
  "PGlite",
  "@electric-sql/pglite",
  "PROSMET_PGLITE_DIR",
  "embedded-postgres"
]) {
  forbid(postgres, token, "postgres");
}

const provision = await read("deployment/provision-postgres.sh");
for (const token of [
  "apt-get download",
  "dpkg-deb -x",
  "postgresql-16",
  "postgresql-client-16",
  "initdb",
  "pg_ctl",
  "pg_isready",
  "RUNNER_TRACKING_ID=",
  "postgres-password",
  "DATABASE_URL",
  "Real rootless PostgreSQL"
]) {
  need(provision, token, "postgres-provision");
}
for (const token of [
  "postgres-server.mjs",
  "pglite",
  "sudo ",
  "systemctl",
  "docker"
]) {
  forbid(provision, token, "postgres-provision");
}

const sync = await read("app/api/sync/route.ts");
for (const token of [
  "prosmet_sync_operations",
  "prosmet_prices",
  "prosmet_files",
  "preserveEstimateRevision",
  "preserveDocumentRevision",
  "export async function POST",
  "export async function GET"
]) {
  need(sync, token, "sync");
}

const shell = await read("components/app/chat-workspace.tsx");
for (const token of ["RightInspector", "app-sidebar", "IndexedDB-кэш готов"]) {
  need(shell, token, "shell");
}
forbid(shell, "SQLite WASM", "shell");

const inspector = await read("components/app/right-inspector.tsx");
for (const token of ["right-inspector", "PostgreSQL", "IndexedDB", "Синхронизация"]) {
  need(inspector, token, "inspector");
}
forbid(inspector, "SQLite WASM", "inspector");

const nextConfig = await read("next.config.ts");
forbid(nextConfig, "'wasm-unsafe-eval'", "csp");
if (!nextConfig.includes("...(isDevelopment ? [\"'unsafe-eval'\"] : [])")) {
  failures.push("csp:production-unsafe-eval-not-disabled");
}
need(nextConfig, "no-store, no-cache, must-revalidate", "cache-control");

const pkg = JSON.parse(await read("package.json"));
for (const dependency of [
  "@assistant-ui/react",
  "@assistant-ui/react-ag-ui",
  "@ag-ui/client",
  "@ag-ui/core",
  "better-auth",
  "pg"
]) {
  if (!pkg.dependencies?.[dependency]) failures.push(`dependency:${dependency}`);
}
for (const dependency of ["sql.js", "@electric-sql/pglite", "embedded-postgres"]) {
  if (pkg.dependencies?.[dependency]) failures.push(`forbidden-dependency:${dependency}`);
}

for (const obsolete of [
  "lib/local/database.ts",
  "scripts/copy-sql-wasm.mjs",
  "public/sql-wasm.wasm",
  "public/sql-wasm-browser.wasm",
  "deployment/postgres-server.mjs"
]) {
  try {
    await access(resolve(root, obsolete));
    failures.push(`obsolete:${obsolete}`);
  } catch {
    // Expected.
  }
}

if (failures.length) {
  console.error("SOURCE CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`SOURCE CONTRACT PASS (${required.length} required files)`);
