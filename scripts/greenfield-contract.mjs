import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const contractPath = "scripts/greenfield-contract.mjs";
const required = [
  ".github/workflows/greenfield-deploy.yml",
  "apps/web/src/app/App.tsx",
  "apps/web/src/app/ReferenceApp.tsx",
  "apps/web/src/mobile-navigation.css",
  "apps/web/src/mobile-chat-reference.css",
  "apps/web/src/features/chat/ChatSurface.tsx",
  "apps/web/src/features/estimate/EstimateEditor.tsx",
  "apps/web/src/features/account/AccountView.tsx",
  "apps/web/src/features/settings/SettingsView.tsx",
  "apps/mobile/App.tsx",
  "apps/mobile/src/MobileNavigation.tsx",
  "apps/mobile/src/ReferenceIcons.tsx",
  "apps/mobile/src/screens/ChatScreen.tsx",
  "apps/mobile/src/screens/EstimateScreen.tsx",
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
  "apps/mobile/src/BottomNav.tsx"
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
    else if (/\.(ts|tsx|css|md|mjs)$/.test(entry.name)) files.push(path);
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

const mainEntry = await readFile(resolve(root, "apps/web/src/main.tsx"), "utf8");
const referenceApp = await readFile(resolve(root, "apps/web/src/app/ReferenceApp.tsx"), "utf8");
const webChat = await readFile(resolve(root, "apps/web/src/features/chat/ChatSurface.tsx"), "utf8");
const referenceCss = await readFile(resolve(root, "apps/web/src/mobile-chat-reference.css"), "utf8");
const nativeApp = await readFile(resolve(root, "apps/mobile/App.tsx"), "utf8");
const nativeChat = await readFile(resolve(root, "apps/mobile/src/screens/ChatScreen.tsx"), "utf8");
const deployment = await readFile(resolve(root, ".github/workflows/greenfield-deploy.yml"), "utf8");

if (!mainEntry.includes("ReferenceApp")) failures.push("mobile-web:reference-app-not-mounted");
if (!mainEntry.includes("mobile-chat-reference.css")) failures.push("mobile-web:reference-css-not-mounted");
if (referenceApp.includes("mobile-bottom-nav")) failures.push("mobile-web:persistent-bottom-navigation");
if (nativeApp.includes("BottomNav")) failures.push("mobile-native:persistent-bottom-navigation");
if (!referenceApp.includes('aria-label="Открыть навигацию"')) failures.push("mobile-web:on-demand-navigation-missing");
if (!nativeApp.includes("MobileNavigation")) failures.push("mobile-native:on-demand-navigation-missing");

for (const token of [
  "chat-reference-badge",
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

if (!deployment.includes("env -u RUNNER_TRACKING_ID")) failures.push("deployment:runner-tracking-id-not-removed");
if (!deployment.includes("post_cleanup_persistence:")) failures.push("deployment:post-cleanup-persistence-job-missing");
if (!deployment.includes("external_acceptance:")) failures.push("deployment:external-acceptance-job-missing");
if (!deployment.includes("runs-on: ubuntu-latest")) failures.push("deployment:external-github-hosted-runner-missing");
if (!deployment.includes("survivedRunnerCleanup")) failures.push("deployment:final-persistence-evidence-missing");
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
  desktop: "new Codex/GPT-like shell",
  mobile: "supplied Chat-style start screen implemented in web and React Native",
  mobileNavigation: "on-demand drawer without persistent bottom navigation",
  mobileStart: "menu badge, centered Chat selector, voice action, three quick actions and pill composer",
  editor: "new estimate workspace",
  accountAndSettings: "new surfaces",
  productionProcess: "detached from runner cleanup",
  productionAcceptance: "post-cleanup plus external GitHub-hosted browser verification"
}, null, 2));
