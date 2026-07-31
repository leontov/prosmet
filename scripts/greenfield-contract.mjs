import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const contractPath = "scripts/greenfield-contract.mjs";
const required = [
  "apps/web/src/app/App.tsx",
  "apps/web/src/mobile-navigation.css",
  "apps/web/src/features/chat/ChatSurface.tsx",
  "apps/web/src/features/estimate/EstimateEditor.tsx",
  "apps/web/src/features/account/AccountView.tsx",
  "apps/web/src/features/settings/SettingsView.tsx",
  "apps/mobile/App.tsx",
  "apps/mobile/src/MobileNavigation.tsx",
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

const webApp = await readFile(resolve(root, "apps/web/src/app/App.tsx"), "utf8");
const nativeApp = await readFile(resolve(root, "apps/mobile/App.tsx"), "utf8");
if (webApp.includes("mobile-bottom-nav")) failures.push("mobile-web:persistent-bottom-navigation");
if (nativeApp.includes("BottomNav")) failures.push("mobile-native:persistent-bottom-navigation");
if (!webApp.includes("aria-label=\"Открыть навигацию\"")) failures.push("mobile-web:on-demand-navigation-missing");
if (!nativeApp.includes("MobileNavigation")) failures.push("mobile-native:on-demand-navigation-missing");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-greenfield-v3",
  legacyUi: "absent",
  desktop: "new Codex/GPT-like shell",
  mobile: "independent native UX without persistent bottom navigation",
  mobileNavigation: "on-demand drawer",
  editor: "new estimate workspace",
  accountAndSettings: "new surfaces"
}, null, 2));
