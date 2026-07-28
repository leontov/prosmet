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
  "lib/local/database.ts",
  "lib/local/idb.ts",
  "lib/local/repository.ts",
  "lib/local/sync.ts",
  "lib/local/attachment-adapter.ts",
  "lib/server/identity.ts",
  "lib/server/postgres.ts",
  "lib/server/rules-agent.ts",
  "lib/exports/estimate.ts",
  "deployment/direct-primary.sh",
  "deployment/primary-stack.sh",
  "public/sql-wasm.wasm"
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
forbidToken(runtime, "useLocalRuntime", "runtime");

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
  "SQLite WASM",
  "Синхронизация",
  "Артефакты"
]) requireToken(inspector, token, "right-inspector");

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

const localDb = await read("lib/local/database.ts");
for (const token of [
  'import("sql.js")',
  "BEGIN IMMEDIATE",
  "this.db.export()",
  "CREATE TABLE IF NOT EXISTS threads",
  "CREATE TABLE IF NOT EXISTS estimates",
  "CREATE TABLE IF NOT EXISTS documents",
  "CREATE TABLE IF NOT EXISTS prices",
  "CREATE TABLE IF NOT EXISTS files",
  "CREATE TABLE IF NOT EXISTS outbox"
]) requireToken(localDb, token, "sqlite-wasm");

const idb = await read("lib/local/idb.ts");
for (const token of [
  'const DB_NAME = "prosmet-local-v2"',
  "transactionDone(transaction)",
  "const done = transactionDone(transaction)",
  "requestResult",
  "OPEN_TIMEOUT_MS"
]) requireToken(idb, token, "indexeddb");

const postgres = await read("lib/server/postgres.ts");
for (const token of [
  "@electric-sql/pglite",
  "PGlite.create",
  "ServerSqlClient",
  "PROSMET_DATABASE_DRIVER",
  "PROSMET_PGLITE_DIR",
  "DATABASE_URL",
  "prosmet_sync_operations",
  "prosmet_threads",
  "prosmet_messages",
  "prosmet_estimates",
  "prosmet_documents",
  "prosmet_agent_runs",
  "withServerTransaction"
]) requireToken(postgres, token, "server-database");

const syncRoute = await read("app/api/sync/route.ts");
for (const token of [
  "resolveServerIdentity",
  "getServerDatabase",
  "ServerSqlClient",
  "prosmet_sync_operations",
  "materialize",
  "export async function POST",
  "export async function GET"
]) requireToken(syncRoute, token, "sync-api");

const localSync = await read("lib/local/sync.ts");
for (const token of [
  "syncWorkspace",
  "SELECT COUNT(*) AS value FROM outbox",
  'fetch("/api/sync"',
  "applyRemoteOperations",
  "sync_state"
]) requireToken(localSync, token, "local-sync");

const directDeployment = await read("deployment/direct-primary.sh");
for (const token of [
  ".next/standalone",
  "PROSMET_DATABASE_DRIVER=pglite",
  "PROSMET_PGLITE_DIR",
  "RUNNER_TRACKING_ID=",
  "/api/backend/status",
  "/api/agent"
]) requireToken(directDeployment, token, "direct-primary");

const networkDeployment = await read("deployment/primary-stack.sh");
for (const token of [
  "postgres:16-alpine",
  "prosmet-postgres",
  "DATABASE_URL=postgresql://prosmet",
  "/api/backend/status",
  "/api/agent"
]) requireToken(networkDeployment, token, "network-primary");

const localFiles = [
  "app/MyRuntimeProvider.tsx",
  "components/tools/estimate-editor.tsx",
  "components/tools/document-editor.tsx",
  "lib/local/repository.ts",
  "lib/local/files.ts",
  "lib/local/sync.ts"
];
for (const path of localFiles) forbidToken(await read(path), "localStorage", path);

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
  "@electric-sql/pglite",
  "sql.js",
  "decimal.js",
  "exceljs",
  "pdfmake",
  "pg"
]) {
  if (!pkg.dependencies?.[dependency]) failures.push(`dependency:${dependency}`);
}

if (failures.length) {
  console.error("SOURCE CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SOURCE CONTRACT PASS (${required.length} required files)`);
