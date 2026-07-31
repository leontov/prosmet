import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const contractPath = "scripts/greenfield-contract.mjs";
const required = [
  ".env.example",
  ".github/workflows/greenfield-deploy.yml",
  "deployment/ensure-public-edge.sh",
  "docs/AGENT_INTEGRATION.md",
  "scripts/prosmet-admin.mjs",
  "apps/web/server.mjs",
  "apps/web/server/agent-schema.mjs",
  "apps/web/server/agent-config.mjs",
  "apps/web/server/agent-adapters.mjs",
  "apps/web/server/agent-service.mjs",
  "apps/web/server/agent-schema.test.mjs",
  "apps/web/e2e/fixture-agent.mjs",
  "apps/web/e2e/harness.mjs",
  "apps/web/src/app/App.tsx",
  "apps/web/src/app/ReferenceApp.tsx",
  "apps/web/src/mobile-navigation.css",
  "apps/web/src/mobile-chat-reference.css",
  "apps/web/src/agent-integration.css",
  "apps/web/src/functional-surfaces.css",
  "apps/web/src/agents/agent-client.ts",
  "apps/web/src/agents/AgentSelector.tsx",
  "apps/web/src/agents/AgentSettingsPanel.tsx",
  "apps/web/src/features/chat/ChatSurface.tsx",
  "apps/web/src/features/estimate/EstimateEditor.tsx",
  "apps/web/src/features/account/AccountView.tsx",
  "apps/web/src/features/settings/SettingsView.tsx",
  "apps/web/src/features/library/LibraryView.tsx",
  "apps/mobile/App.tsx",
  "apps/mobile/src/MobileNavigation.tsx",
  "apps/mobile/src/ReferenceIcons.tsx",
  "apps/mobile/src/runtime/RuntimeProvider.tsx",
  "apps/mobile/src/screens/ChatScreen.tsx",
  "apps/mobile/src/screens/EstimateScreen.tsx",
  "apps/mobile/src/screens/AccountScreen.tsx",
  "apps/mobile/src/screens/SettingsScreen.tsx",
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
  "apps/mobile/src/data.ts",
  "apps/web/src/data/demo.ts"
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
  try { await access(resolve(root, path)); } catch { failures.push(`missing:${path}`); }
}
for (const path of forbiddenPaths) {
  try { await access(resolve(root, path)); failures.push(`forbidden-present:${path}`); } catch {}
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "dist", "target"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(ts|tsx|css|md|mjs|sh)$/.test(entry.name)) files.push(path);
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

const read = async (path) => readFile(resolve(root, path), "utf8");
const mainEntry = await read("apps/web/src/main.tsx");
const referenceApp = await read("apps/web/src/app/ReferenceApp.tsx");
const webApp = await read("apps/web/src/app/App.tsx");
const webRuntime = await read("apps/web/src/runtime/RuntimeProvider.tsx");
const webChat = await read("apps/web/src/features/chat/ChatSurface.tsx");
const referenceCss = await read("apps/web/src/mobile-chat-reference.css");
const nativeApp = await read("apps/mobile/App.tsx");
const nativeRuntime = await read("apps/mobile/src/runtime/RuntimeProvider.tsx");
const nativeChat = await read("apps/mobile/src/screens/ChatScreen.tsx");
const server = await read("apps/web/server.mjs");
const agentSchema = await read("apps/web/server/agent-schema.mjs");
const agentConfig = await read("apps/web/server/agent-config.mjs");
const agentAdapters = await read("apps/web/server/agent-adapters.mjs");
const agentService = await read("apps/web/server/agent-service.mjs");
const agentSettings = await read("apps/web/src/agents/AgentSettingsPanel.tsx");
const agentSelector = await read("apps/web/src/agents/AgentSelector.tsx");
const library = await read("apps/web/src/features/library/LibraryView.tsx");
const account = await read("apps/web/src/features/account/AccountView.tsx");
const settings = await read("apps/web/src/features/settings/SettingsView.tsx");
const harness = await read("apps/web/e2e/harness.mjs");
const adminScript = await read("scripts/prosmet-admin.mjs");
const agentDocs = await read("docs/AGENT_INTEGRATION.md");
const deployment = await read(".github/workflows/greenfield-deploy.yml");
const publicEdge = await read("deployment/ensure-public-edge.sh");

if (!mainEntry.includes("ReferenceApp")) failures.push("mobile-web:reference-app-not-mounted");
if (!mainEntry.includes("mobile-chat-reference.css")) failures.push("mobile-web:reference-css-not-mounted");
if (!mainEntry.includes("agent-integration.css")) failures.push("agents:integration-styles-not-mounted");
if (referenceApp.includes("mobile-bottom-nav")) failures.push("mobile-web:persistent-bottom-navigation");
if (nativeApp.includes("BottomNav")) failures.push("mobile-native:persistent-bottom-navigation");
if (!referenceApp.includes('aria-label="Открыть навигацию"')) failures.push("mobile-web:on-demand-navigation-missing");
if (!nativeApp.includes("MobileNavigation")) failures.push("mobile-native:on-demand-navigation-missing");

for (const token of [
  "chat-reference-title",
  "chat-reference-voice",
  "mobile-reference-start",
  "Создать изображение",
  "Напиши или отредактируй",
  "Искать в интернете",
  "Спросить Просметчик..."
]) {
  if (!`${referenceApp}\n${webChat}\n${referenceCss}`.includes(token)) failures.push(`mobile-web:reference-token-missing:${token}`);
}

for (const token of [
  "MenuGlyph",
  "ChevronGlyph",
  "VoiceGlyph",
  "Создать изображение",
  "Напиши или отредактируй",
  "Искать в интернете",
  "Спросить Просметчик..."
]) {
  if (!`${nativeApp}\n${nativeChat}`.includes(token)) failures.push(`mobile-native:reference-token-missing:${token}`);
}

if (!referenceCss.includes("grid-template-columns: 48px minmax(0, 1fr) 42px 48px")) failures.push("mobile-web:four-control-composer-missing");
if (!referenceCss.includes("--chat-reference-blue: #0a84ff")) failures.push("mobile-web:voice-blue-token-missing");
if (!referenceCss.includes("border-radius: 34px")) failures.push("mobile-web:pill-composer-missing");

const productionSource = [server, webApp, referenceApp, webRuntime, nativeApp, nativeRuntime, library, account, settings].join("\n");
for (const token of [
  "demoEstimate",
  "sampleEstimate",
  "estimate-demo",
  "mobile-demo",
  "Подготовил локальный черновик",
  "Владислав Кочуров",
  "MacBook Air",
  "Квартира 56 · ЖК Светлый"
]) {
  if (productionSource.includes(token)) failures.push(`placeholder-token:${token}`);
}

for (const token of [
  '"openai-compatible"',
  '"ollama"',
  '"ag-ui"',
  '"a2a"',
  '"codex-app-server"',
  "prosmet_create_estimate",
  "normalizeEstimate",
  "outputSchema",
  'spawn("codex", ["app-server"',
  "item/agentMessage/delta",
  "turn/completed"
]) {
  if (!`${agentSchema}\n${agentAdapters}`.includes(token)) failures.push(`agent-adapter-token-missing:${token}`);
}

for (const token of [
  "PROSMET_AGENT_CONFIG_KEY",
  "PROSMET_ADMIN_TOKEN",
  "aes-256-gcm",
  "timingSafeEqual",
  "PROSMET_AGENT_PROVIDERS_JSON",
  "PROSMET_CODEX_ENABLED"
]) {
  if (!agentConfig.includes(token)) failures.push(`agent-config-token-missing:${token}`);
}

for (const token of [
  '"/api/agents"',
  '"/api/agent"',
  '"/api/admin/agents"',
  "invokeConfiguredAgent",
  "requireAdmin"
]) {
  if (!`${server}\n${agentService}`.includes(token)) failures.push(`agent-api-token-missing:${token}`);
}

for (const token of [
  "AgentSettingsPanel",
  "saveAgentConfiguration",
  "testAgentConfiguration",
  "activateAgentConfiguration",
  "deleteAgentConfiguration",
  "Токен супер-администратора"
]) {
  if (!agentSettings.includes(token)) failures.push(`agent-admin-ui-token-missing:${token}`);
}
if (!agentSelector.includes("/api/agents") && !agentSelector.includes("loadAgentCatalog")) failures.push("agents:workspace-selector-missing");
if (!webRuntime.includes("agentId: selectedAgentId()")) failures.push("agents:web-runtime-selection-missing");
if (!nativeRuntime.includes("/api/agent")) failures.push("agents:native-runtime-route-missing");
if (!harness.includes("fixture-agent.mjs") || !harness.includes("PROSMET_AGENT_PROVIDERS_JSON")) failures.push("agents:e2e-real-router-harness-missing");

for (const token of ["status", "show-token", "bootstrap", "rotate-token", "PROSMET_AGENT_CONFIG_KEY"]) {
  if (!adminScript.includes(token)) failures.push(`admin-script-token-missing:${token}`);
}
for (const token of ["OpenAI-compatible", "Ollama", "Codex App Server", "AG-UI", "A2A", "AES-256-GCM"]) {
  if (!agentDocs.includes(token)) failures.push(`agent-docs-token-missing:${token}`);
}

for (const token of ["admin 127.0.0.1:2019", "reverse_proxy 127.0.0.1:${UPSTREAM_PORT}", "RUNNER_TRACKING_ID", "public-health-route-not-ready"]) {
  if (!publicEdge.includes(token)) failures.push(`public-edge-token-missing:${token}`);
}

if (!deployment.includes("env -u RUNNER_TRACKING_ID")) failures.push("deployment:runner-tracking-id-not-removed");
if (!deployment.includes("post_cleanup_persistence:")) failures.push("deployment:post-cleanup-persistence-job-missing");
if (!deployment.includes("external_acceptance:")) failures.push("deployment:external-acceptance-job-missing");
if (!deployment.includes("runs-on: ubuntu-latest")) failures.push("deployment:external-github-hosted-runner-missing");
if (!deployment.includes("survivedRunnerCleanup")) failures.push("deployment:final-persistence-evidence-missing");
if (!deployment.includes("canonicalEdgeReloaded")) failures.push("deployment:canonical-edge-acceptance-missing");
if (!deployment.includes("allResolvedIpv4Checked")) failures.push("deployment:all-resolved-ipv4-check-missing");
if (!deployment.includes("ensure-public-edge.sh")) failures.push("deployment:canonical-edge-repair-missing");
if (!deployment.includes('cp -a apps/web/server "$RELEASE_DIR/server"')) failures.push("deployment:agent-server-modules-not-installed");
if (!deployment.includes("agent-admin.env")) failures.push("deployment:persistent-agent-admin-secrets-missing");
if (!deployment.includes("PROSMET_AGENT_CONFIG_KEY")) failures.push("deployment:agent-config-key-not-propagated");
if (!deployment.includes("/api/agents")) failures.push("deployment:agent-registry-not-verified");
if (deployment.includes('PORT=3200 PROSMET_RELEASE_SHA="$RELEASE_SHA" nohup node server.mjs')) {
  failures.push("deployment:ephemeral-runner-tracked-node-launch");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-greenfield-v3",
  legacyUi: "absent",
  placeholders: "removed from production source",
  desktop: "new Codex/GPT-like shell",
  mobile: "supplied Chat-style start screen implemented in web and React Native",
  mobileNavigation: "on-demand drawer without persistent bottom navigation",
  mobileStart: "dynamic attention badge, centered Chat selector, voice action, three quick actions and pill composer",
  agents: ["OpenAI-compatible", "Ollama", "Codex App Server", "AG-UI", "A2A"],
  agentSecrets: "encrypted server-side and protected by super-admin token",
  agentTesting: "real adapter router exercised through an isolated OpenAI-compatible fixture",
  editor: "opens only from a real validated estimate artifact",
  accountAndSettings: "live server state without invented users, devices or providers",
  productionProcess: "detached from runner cleanup",
  canonicalEdge: "reconciled before and after cleanup and verified on every resolved IPv4",
  productionAcceptance: "post-cleanup plus external GitHub-hosted browser verification"
}, null, 2));
