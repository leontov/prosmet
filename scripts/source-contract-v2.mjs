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
  "deployment/postgres-server.mjs",
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

const runtime = await read("app/MyRuntimeProvider.tsx");
for (const token of ["HttpAgent", "useAgUiRuntime", "AssistantRuntimeProvider", "ProsmetAttachmentAdapter", "ThreadHistoryAdapter"]) {
  need(runtime, token, "assistant-ui-runtime");
}
for (const token of ["useLocalRuntime", "localStorage"]) forbid(runtime, token, "assistant-ui-runtime");

const agent = await read("app/api/agent/route.ts");
for (const token of ["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "TOOL_CALL_ARGS", "ACTIVITY_SNAPSHOT", "messageId: activityMessageId", "RUN_FINISHED", "text/event-stream"]) {
  need(agent, token, "ag-ui");
}

const idb = await read("lib/local/idb.ts");
for (const token of ["prosmet-cache-v3", "indexedDB.open", "threads", "messages", "estimates", "estimateRevisions", "documents", "documentRevisions", "prices", "files", "outbox", "syncState", "withLocalTransaction"]) {
  need(idb, token, "indexeddb");
}
for (const token of ["sql.js", "WebAssembly", "wasm"]) forbid(idb, token, "indexeddb");

for (const path of ["lib/local/repository.ts", "lib/local/files.ts", "lib/local/sync.ts"]) {
  const source = await read(path);
  need(source, "LOCAL_STORES", path);
  forbid(source, "getDatabase", path);
  forbid(source, "sql.js", path);
  forbid(source, "sqlite.run", path);
  forbid(source, "localStorage", path);
}

const postgres = await read("lib/server/postgres.ts");
for (const token of ["Pool", "DATABASE_URL", "prosmet_threads", "prosmet_messages", "prosmet_estimates", "prosmet_estimate_revisions", "prosmet_documents", "prosmet_document_revisions", "prosmet_prices", "prosmet_files", "prosmet_agent_runs", "withServerTransaction"]) {
  need(postgres, token, "postgres");
}
for (const token of ["PGlite", "@electric-sql/pglite", "PROSMET_PGLITE_DIR"]) forbid(postgres, token, "postgres");

const postgresServer = await read("deployment/postgres-server.mjs");
for (const token of ["embedded-postgres", "persistent: true", "PG_VERSION", "postgres.initialise", "postgres.start", "CREATE DATABASE", "127.0.0.1"]) {
  need(postgresServer, token, "postgres-server");
}
for (const token of ["WebAssembly", "PGlite", "sudo", "docker"]) forbid(postgresServer, token, "postgres-server");

const provision = await read("deployment/provision-postgres.sh");
for (const token of ["postgres-server.mjs", "RUNNER_TRACKING_ID=", "postgres-password", "55432", "DATABASE_URL", "probe_database", "without sudo"]) {
  need(provision, token, "postgres-provision");
}
for (const token of ["sudo", "apt-get", "systemctl", "docker", "pglite"]) forbid(provision, token, "postgres-provision");

const sync = await read("app/api/sync/route.ts");
for (const token of ["prosmet_sync_operations", "prosmet_prices", "prosmet_files", "preserveEstimateRevision", "preserveDocumentRevision", "export async function POST", "export async function GET"]) {
  need(sync, token, "sync");
}

const shell = await read("components/app/chat-workspace.tsx");
for (const token of ["RightInspector", "app-sidebar", "IndexedDB-кэш готов"]) need(shell, token, "shell");
forbid(shell, "SQLite WASM", "shell");

const inspector = await read("components/app/right-inspector.tsx");
for (const token of ["right-inspector", "PostgreSQL", "IndexedDB", "Синхронизация"]) need(inspector, token, "inspector");
forbid(inspector, "SQLite WASM", "inspector");

const nextConfig = await read("next.config.ts");
forbid(nextConfig, "'wasm-unsafe-eval'", "csp");
if (!nextConfig.includes("...(isDevelopment ? [\"'unsafe-eval'\"] : [])")) {
  failures.push("csp:production-unsafe-eval-not-disabled");
}

const pkg = JSON.parse(await read("package.json"));
for (const dependency of ["@assistant-ui/react", "@assistant-ui/react-ag-ui", "@ag-ui/client", "@ag-ui/core", "embedded-postgres", "pg"]) {
  if (!pkg.dependencies?.[dependency]) failures.push(`dependency:${dependency}`);
}
for (const dependency of ["sql.js", "@electric-sql/pglite"]) {
  if (pkg.dependencies?.[dependency]) failures.push(`forbidden-dependency:${dependency}`);
}

for (const obsolete of ["lib/local/database.ts", "scripts/copy-sql-wasm.mjs", "public/sql-wasm.wasm", "public/sql-wasm-browser.wasm"]) {
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
