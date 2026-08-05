import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const contractPath = "scripts/greenfield-contract.mjs";

const required = [
  ".github/workflows/greenfield-ci.yml",
  ".github/workflows/greenfield-deploy.yml",
  ".github/workflows/public-root-recovery.yml",
  "deployment/ensure-public-edge.sh",
  "apps/web/server.mjs",
  "apps/web/server/estimate-store.mjs",
  "apps/web/src/features/estimate/estimate-api.ts",
  "apps/web/src/app/App.tsx",
  "apps/web/src/mobile-navigation.css",
  "apps/web/src/agent-integrations.css",
  "apps/web/src/workspace-real.css",
  "apps/web/src/features/agents/agent-api.ts",
  "apps/web/src/features/chat/ChatSurface.tsx",
  "apps/web/src/features/estimate/EstimateEditor.tsx",
  "apps/web/src/features/library/LibraryView.tsx",
  "apps/web/src/features/account/AccountView.tsx",
  "apps/web/src/features/settings/SettingsView.tsx",
  "apps/web/e2e/fixture-agent.mjs",
  "apps/mobile/App.tsx",
  "apps/mobile/src/MobileNavigation.tsx",
  "apps/mobile/src/agent-session.ts",
  "apps/mobile/src/runtime/RuntimeProvider.tsx",
  "apps/mobile/src/screens/ChatScreen.tsx",
  "apps/mobile/src/screens/EstimateScreen.tsx",
  "apps/mobile/src/screens/AccountScreen.tsx",
  "apps/mobile/src/screens/SettingsScreen.tsx",
  "packages/contracts/src/index.ts",
  "crates/estimate-engine/src/lib.rs",
  "docs/DESIGN_SYSTEM.md"
];

const forbiddenPaths = [
  "app/premium-product.css",
  "app/premium-product-fixes.css",
  "components/app/premium-chat-workspace.tsx",
  "components/app/premium-prosmet-application.tsx",
  "components/app/premium-estimate-workspace-editor.tsx",
  "app/estimate-workspace.css",
  "app/premium-foundation.css",
  "apps/mobile/src/BottomNav.tsx",
  "apps/web/src/data/demo.ts",
  "apps/mobile/src/data.ts"
];

const forbiddenTokens = [
  "prosmet-v2-",
  "prosmet-premium-",
  "premium-product-fixes",
  "PremiumProsmetApplication",
  "PremiumChatWorkspace"
];

const failures = [];

for (const path of required) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

for (const path of forbiddenPaths) {
  try {
    await access(resolve(root, path));
    failures.push(`forbidden-present:${path}`);
  } catch {}
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "target"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(ts|tsx|css|md|mjs|sh|yml)$/.test(entry.name)) files.push(path);
  }
  return files;
}

for (const path of await walk(root)) {
  const repoPath = relative(root, path).replaceAll("\\", "/");
  if (repoPath === contractPath) continue;
  const source = await readFile(path, "utf8");
  for (const token of forbiddenTokens) {
    if (source.includes(token)) failures.push(`legacy-token:${repoPath}:${token}`);
  }
}

const read = (path) => readFile(resolve(root, path), "utf8");
const webApp = await read("apps/web/src/app/App.tsx");
const webRuntime = await read("apps/web/src/runtime/RuntimeProvider.tsx");
const server = await read("apps/web/server.mjs");
const webSettings = await read("apps/web/src/features/settings/SettingsView.tsx");
const webAccount = await read("apps/web/src/features/account/AccountView.tsx");
const webLibrary = await read("apps/web/src/features/library/LibraryView.tsx");
const webEstimate = await read("apps/web/src/features/estimate/EstimateEditor.tsx");
const webChat = await read("apps/web/src/features/chat/ChatSurface.tsx");
const nativeApp = await read("apps/mobile/App.tsx");
const nativeRuntime = await read("apps/mobile/src/runtime/RuntimeProvider.tsx");
const nativeSettings = await read("apps/mobile/src/screens/SettingsScreen.tsx");
const nativeAccount = await read("apps/mobile/src/screens/AccountScreen.tsx");
const nativeChat = await read("apps/mobile/src/screens/ChatScreen.tsx");
const mobileSession = await read("apps/mobile/src/agent-session.ts");
const playwright = await read("apps/web/playwright.config.ts");
const e2e = await read("apps/web/e2e/app.spec.ts");
const deployment = await read(".github/workflows/greenfield-deploy.yml");
const rootRecovery = await read(".github/workflows/public-root-recovery.yml");
const edge = await read("deployment/ensure-public-edge.sh");

if (webApp.includes("mobile-bottom-nav")) failures.push("mobile-web:persistent-bottom-navigation");
if (nativeApp.includes("BottomNav")) failures.push("mobile-native:persistent-bottom-navigation");
if (!webApp.includes('aria-label="Открыть навигацию"')) failures.push("mobile-web:on-demand-navigation-missing");
if (!nativeApp.includes("MobileNavigation")) failures.push("mobile-native:on-demand-navigation-missing");

for (const [name, source] of [
  ["web-app", webApp],
  ["web-runtime", webRuntime],
  ["server", server],
  ["native-app", nativeApp],
  ["native-runtime", nativeRuntime],
  ["native-settings", nativeSettings],
  ["native-account", nativeAccount]
]) {
  for (const token of ["demoEstimate", "sampleEstimate", "mobile-demo", "estimate-demo"]) {
    if (source.includes(token)) failures.push(`${name}:demo-fallback:${token}`);
  }
}

for (const token of ["Владислав Кочуров", "Founder", "Дом в Альметьевске", "MacBook Air", "12 мин"]) {
  if ([webApp, webAccount, webLibrary, nativeApp, nativeAccount].some((source) => source.includes(token))) {
    failures.push(`hardcoded-product-data:${token}`);
  }
}

for (const provider of ["openai-compatible", "ollama", "codex-app-server", "http-agent"]) {
  if (!server.includes(`\"${provider}\"`)) failures.push(`server:provider-adapter-missing:${provider}`);
  if (!webSettings.includes(provider)) failures.push(`web-settings:provider-option-missing:${provider}`);
  if (!nativeSettings.includes(provider)) failures.push(`native-settings:provider-option-missing:${provider}`);
}

for (const token of [
  'createCipheriv("aes-256-gcm"',
  "/api/admin/session",
  "/api/account",
  "/api/agents",
  "/api/agent",
  "initialize",
  "initialized",
  "thread/start",
  "turn/start",
  "item/agentMessage/delta",
  "turn/completed"
]) {
  if (!server.includes(token)) failures.push(`server:agent-contract-missing:${token}`);
}

if (!server.includes('approvalPolicy: "never"')) failures.push("server:codex-noninteractive-approval-policy-missing");
if (!server.includes('sandboxPolicy: { type: "readOnly" }')) failures.push("server:codex-readonly-sandbox-missing");
if (!server.includes("secretCipher")) failures.push("server:encrypted-secret-storage-missing");
if (!server.includes("timingSafeEqual")) failures.push("server:constant-time-admin-auth-missing");
if (server.includes("asksEstimate")) failures.push("server:legacy-fake-responder-present");
for (const token of ["createEstimateStore", "/api/estimates", "/api/capabilities", "estimateStore.saveEstimate", 'database: "sqlite"']) {
  if (!server.includes(token)) failures.push(`server:database-first-contract-missing:${token}`);
}

for (const token of ["createAgent", "updateAgent", "deleteAgent", "activateAgent", "testAgent", "loginAdmin"]) {
  if (!webSettings.includes(token)) failures.push(`web-settings:working-action-missing:${token}`);
}
for (const token of ["mobileApiFetch", "setMobileAdminToken", "setMobileApiBaseUrl", "/api/agents"]) {
  if (!nativeSettings.includes(token) && !mobileSession.includes(token)) failures.push(`native-settings:working-action-missing:${token}`);
}
if (!mobileSession.includes("expo-secure-store")) failures.push("native:secure-store-missing");
if (!webRuntime.includes("/api/agent") || webRuntime.includes("demoEstimate")) failures.push("web-runtime:real-agent-only-contract-failed");
if (!nativeRuntime.includes('mobileApiFetch("/api/agent"') || nativeRuntime.includes("demoEstimate")) failures.push("native-runtime:real-agent-only-contract-failed");

if (webChat.includes("composer-attach") || nativeChat.includes("styles.attach")) failures.push("chat:inert-attachment-control-present");
if (!webEstimate.includes("downloadExcel") || !webEstimate.includes("printEstimate") || !webEstimate.includes("navigator.share")) failures.push("estimate:working-export-or-share-missing");
if (webEstimate.includes('aria-label="Скачать PDF"><') || webEstimate.includes('aria-label="Скачать Excel"><')) failures.push("estimate:inert-export-control-present");

if (!playwright.includes("fixture-agent.mjs")) failures.push("testing:external-http-agent-fixture-not-started");
if (!e2e.includes("Fixture HTTP Agent") || !e2e.includes("/api/agents")) failures.push("testing:real-agent-end-to-end-missing");

for (const token of [
  "env -u RUNNER_TRACKING_ID",
  "post_cleanup_persistence:",
  "external_acceptance:",
  "runs-on: ubuntu-latest",
  "survivedRunnerCleanup",
  "ensure-public-edge.sh",
  "canonicalEdgeReloaded",
  "allResolvedIpv4Checked"
]) {
  if (!deployment.includes(token)) failures.push(`deployment:contract-missing:${token}`);
}
if (deployment.includes('PORT=3200 PROSMET_RELEASE_SHA="$RELEASE_SHA" nohup node server.mjs')) {
  failures.push("deployment:ephemeral-runner-tracked-node-launch");
}

for (const token of [
  "root_matches()",
  "health_matches()",
  '<div id=\"root\"></div>',
  "reverse_proxy 127.0.0.1:${UPSTREAM_PORT}",
  "http://127.0.0.1:2019/load",
  "env -u RUNNER_TRACKING_ID",
  "upstream-health-or-root-not-ready",
  "public-health-or-root-not-ready",
  'routeMode: "single-terminal-reverse-proxy"',
  'verifiedPaths: ["/", "/api/health"]'
]) {
  if (!edge.includes(token)) failures.push(`edge:all-routes-contract-missing:${token}`);
}
if (edge.includes("@health path /api/health")) failures.push("edge:split-health-handler-can-fall-through");

for (const token of [
  "git rev-parse origin/main",
  "RELEASE_INSTANCE",
  "dist/index.html",
  "PROSMET_PUBLIC_AGENT_ACCESS=true",
  "ln -sfn",
  "mv -Tf",
  "Check every resolved public IPv4 address",
  "public-root-recovery.json"
]) {
  if (!rootRecovery.includes(token)) failures.push(`root-recovery:contract-missing:${token}`);
}


if (server.includes('const expectedQwenKeySha256 = "')) failures.push("server:qwen-hardcoded-key-fingerprint");
if (!server.includes("process.env.PROSMET_QWEN_KEY_SHA256")) failures.push("server:qwen-key-fingerprint-env-missing");
if (!server.includes('request.method === "POST" && url.pathname === "/api/provisioning/qwen/complete"')) failures.push("server:qwen-provisioning-post-only-missing");
if (!server.includes("composeSystemPrompt(this.agent, context)")) failures.push("server:codex-context-prompt-missing");
if (server.includes("this.agent.systemPrompt || systemInstructions")) failures.push("server:codex-context-prompt-bypass");
if (/estimateIntentPattern[^\n]+коммерческ/u.test(server)) failures.push("server:document-intent-can-create-estimate");


if (server.includes("selectProjectByIdentity.get(ownerId, title, region)")) failures.push("server:project-title-region-reuse");
if (server.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_project_identity")) failures.push("server:project-title-region-unique-index");
if (!server.includes('stableEntityId("project", ownerId, estimate.id, title, region)')) failures.push("server:project-estimate-bound-identity-missing");
if (!server.includes("DROP INDEX IF EXISTS idx_workflow_project_identity")) failures.push("server:project-identity-migration-missing");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-agent-integrations-v1",
  legacyUi: "absent",
  demoFallbacks: "absent",
  desktop: "new Codex/GPT-like shell",
  mobile: "independent native UX without persistent bottom navigation",
  mobileNavigation: "on-demand drawer",
  editor: "working local workspace with print, Excel and system sharing",
  accountAndSettings: "persisted server profile and real agent control plane",
  agentAdapters: ["OpenAI-compatible", "Ollama", "Codex App Server", "HTTP agent"],
  secrets: "AES-256-GCM server storage and mobile SecureStore",
  productionProcess: "detached from runner cleanup",
  publicEdge: "single terminal reverse proxy verified for root and health",
  recovery: "exact-main immutable release replacement plus external IPv4 proof",
  productionAcceptance: "post-cleanup, every IPv4 address, root marker and external browser verification"
}, null, 2));
