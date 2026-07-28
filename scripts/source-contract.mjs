import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "package.json",
  "app/layout.tsx",
  "app/page.tsx",
  "app/MyRuntimeProvider.tsx",
  "app/toolkit.tsx",
  "app/api/agent/route.ts",
  "app/api/health/route.ts",
  "app/api/backend/status/route.ts",
  "app/api/sync/route.ts",
  "components/app/chat-workspace.tsx",
  "components/app/right-inspector.tsx",
  "components/app/runtime-status.tsx",
  "components/chat/prosmet-thread.tsx",
  "components/tools/technology-card.tsx",
  "components/tools/estimate-editor.tsx",
  "components/tools/document-editor.tsx",
  "lib/domain/estimate.ts",
  "lib/local/idb.ts",
  "lib/local/repository.ts",
  "lib/local/files.ts",
  "lib/local/sync.ts",
  "lib/local/attachment-adapter.ts",
  "lib/server/identity.ts",
  "lib/server/postgres.ts",
  "lib/server/rules-agent.ts",
  "lib/exports/estimate.ts",
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

const read = (path) => readFile(resolve(root, path), "utf8");
const requireToken = (source, token, context) => {
  if (!source.includes(token)) failures.push(`${context}:missing:${token}`);
};
const forbidToken = (source, token, context) => {
  if (source.includes(token)) failures.push(`${context}:forbidden:${token}`);
};

const runtime = await read("app/MyRuntimeProvider.tsx");
for (const token of [
  "HttpAgent",
  "useAgUiRuntime",
  "AssistantRuntimeProvider",
  "ProsmetAttachmentAdapter",
  "ThreadHistoryAdapter",
  "threadList"
]) requireToken(runtime, token, "runtime");
for (const token of ["useLocalRuntime", "localStorage"]) forbidToken(runtime, token, "runtime");

const route = await read("app/api/agent/route.ts");
for (const token of [
  "RUN_STARTED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "STATE_SNAPSHOT",
  "ACTIVITY_SNAPSHOT",
  "messageId: activityMessageId",
  "RUN_FINISHED",
  "RUN_ERROR",
  "beginAgentRun",
  "finishAgentRun",
  "text/event-stream"
]) requireToken(route, token, "ag-ui-route");

const workspace = await read("components/app/chat-workspace.tsx");
for (const token of [
  "RightInspector",
  "PanelRightOpenIcon",
  'data-testid="app-sidebar"',
  "Просметчик",
  "Сметы и чаты"
]) requireToken(workspace, token, "codex-shell");

const inspector = await read("components/app/right-inspector.tsx");
for (const token of [
  'data-testid="right-inspector"',
  "Рабочий контекст",
  "PostgreSQL",
  "IndexedDB",
  "Синхронизация",
  "Артефакты"
]) requireToken(inspector, token, "right-inspector");
forbidToken(inspector, "SQLite WASM", "right-inspector");

const chat = await read("components/chat/prosmet-thread.tsx");
for (const token of [
  "ThreadPrimitive.Root",
  "ThreadPrimitive.Messages",
  "ComposerPrimitive.Input",
  "ComposerPrimitive.Send",
  "ComposerPrimitive.Cancel",
  "MessagePrimitive.GroupedParts",
  "BranchPickerPrimitive.Root",
  "ActionBarPrimitive.Copy",
  "AttachmentDropzone"
]) requireToken(chat, token, "chat-ui");

const toolkit = await read("app/toolkit.tsx");
for (const token of [
  "defineToolkit",
  "technology_card",
  "estimate_draft",
  "commercial_proposal",
  "contract_draft",
  "workspace_status"
]) requireToken(toolkit, token, "toolkit");

const idb = await read("lib/local/idb.ts");
for (const token of [
  'const DB_NAME = "prosmet-cache-v3"',
  "indexedDB.open",
  "LOCAL_STORES",
  'threads: "threads"',
  'messages: "messages"',
  'estimates: "estimates"',
  'documents: "documents"',
  'prices: "prices"',
  'files: "files"',
  'outbox: "outbox"',
  'syncState: "syncState"',
  "withLocalTransaction",
  "requestResult",
  "OPEN_TIMEOUT_MS"
]) requireToken(idb, token, "native-indexeddb");
for (const token of ["sql.js", "sqlite", "WebAssembly", "wasm"]) {
  forbidToken(idb, token, "native-indexeddb");
}

const repository = await read("lib/local/repository.ts");
for (const token of [
  "ProsmetRepository",
  "appendMessage",
  "saveEstimate",
  "saveConfirmedPrices",
  "saveDocument",
  "OutboxRecord",
  "LOCAL_STORES",
  "withLocalTransaction"
]) requireToken(repository, token, "local-repository");
for (const token of ["getDatabase", "sql.js", "sqlite.run", "localStorage"]) {
  forbidToken(repository, token, "local-repository");
}

const files = await read("lib/local/files.ts");
for (const token of [
  "storeFile",
  "loadFile",
  "deleteFile",
  "LOCAL_STORES.files",
  "sha256Hex"
]) requireToken(files, token, "local-files");
for (const token of ["getDatabase", "sql.js", "sqlite.run"]) {
  forbidToken(files, token, "local-files");
}

const postgres = await read("lib/server/postgres.ts");
for (const token of [
  "Pool",
  "ServerSqlClient",
  "DATABASE_URL",
  "prosmet_sync_operations",
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
]) requireToken(postgres, token, "server-postgres");
for (const token of ["@electric-sql/pglite", "PGlite", "PROSMET_PGLITE_DIR"]) {
  forbidToken(postgres, token, "server-postgres");
}

const syncRoute = await read("app/api/sync/route.ts");
for (const token of [
  "resolveServerIdentity",
  "getServerDatabase",
  "prosmet_sync_operations",
  "prosmet_prices",
  "prosmet_files",
  "preserveEstimateRevision",
  "preserveDocumentRevision",
  "export async function POST",
  "export async function GET"
]) requireToken(syncRoute, token, "sync-api");

const localSync = await read("lib/local/sync.ts");
for (const token of [
  "syncWorkspace",
  "getAllRecords<OutboxRecord>",
  'fetch("/api/sync"',
  "applyRemoteOperations",
  "LOCAL_STORES.syncState"
]) requireToken(localSync, token, "local-sync");
for (const token of ["getDatabase", "sql.js", "sync_state", "sqlite.run"]) {
  forbidToken(localSync, token, "local-sync");
}

const provision = await read("deployment/provision-postgres.sh");
for (const token of [
  "postgresql-client",
  "systemctl enable --now postgresql",
  "CREATE ROLE",
  "createdb",
  "DATABASE_URL",
  "database.env"
]) requireToken(provision, token, "postgres-provisioning");

const directDeployment = await read("deployment/direct-primary.sh");
for (const token of [
  ".next/standalone",
  "PROSMET_DATABASE_DRIVER=postgres",
  "DATABASE_URL",
  "database.env",
  "RUNNER_TRACKING_ID=",
  "ACTIVITY_SNAPSHOT",
  "is missing messageId",
  "/api/backend/status",
  "/api/sync",
  "/api/agent"
]) requireToken(directDeployment, token, "direct-primary");
for (const token of ["pglite", "PROSMET_PGLITE_DIR", "sql-wasm", "wasm"]) {
  forbidToken(directDeployment, token, "direct-primary");
}

const nextConfig = await read("next.config.ts");
forbidToken(nextConfig, "'wasm-unsafe-eval'", "csp");
if (!nextConfig.includes("...(isDevelopment ? [\"'unsafe-eval'\"] : [])")) {
  failures.push("csp:production-unsafe-eval-must-be-disabled");
}

for (const path of [
  "app/MyRuntimeProvider.tsx",
  "components/tools/estimate-editor.tsx",
  "components/tools/document-editor.tsx",
  "lib/local/repository.ts",
  "lib/local/files.ts",
  "lib/local/sync.ts"
]) {
  forbidToken(await read(path), "localStorage", path);
}

const estimate = await read("components/tools/estimate-editor.tsx");
for (const token of [
  "calculateEstimate",
  "validateForApproval",
  "saveConfirmedPrices",
  "exportEstimatePdf",
  "exportEstimateXlsx",
  'data-testid="estimate-editor"'
]) requireToken(estimate, token, "estimate-editor");

const pkg = JSON.parse(await read("package.json"));
for (const dependency of [
  "@assistant-ui/react",
  "@assistant-ui/react-ag-ui",
  "@ag-ui/client",
  "@ag-ui/core",
  "decimal.js",
  "exceljs",
  "pdfmake",
  "pg"
]) {
  if (!pkg.dependencies?.[dependency]) failures.push(`dependency:${dependency}`);
}
for (const forbidden of ["sql.js", "@electric-sql/pglite"]) {
  if (pkg.dependencies?.[forbidden]) failures.push(`forbidden-dependency:${forbidden}`);
}
for (const forbiddenScript of ["copy:wasm", "postinstall", "prebuild"]) {
  if (pkg.scripts?.[forbiddenScript]?.includes("wasm")) {
    failures.push(`forbidden-script:${forbiddenScript}`);
  }
}

for (const obsolete of [
  "lib/local/database.ts",
  "scripts/copy-sql-wasm.mjs",
  "public/sql-wasm.wasm",
  "public/sql-wasm-browser.wasm"
]) {
  try {
    await access(resolve(root, obsolete));
    failures.push(`obsolete:${obsolete}`);
  } catch {
    // Expected: the browser runtime no longer ships SQLite WASM.
  }
}

if (failures.length) {
  console.error("SOURCE CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SOURCE CONTRACT PASS (${required.length} required files)`);
