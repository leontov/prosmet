import { access, readFile } from "node:fs/promises";

const required = [
  "Cargo.toml",
  "crates/prosmet-engine/src/lib.rs",
  "crates/prosmet-engine/src/main.rs",
  "lib/server/engine/rust-engine.ts",
  "app/api/engine/calculate/route.ts",
  "lib/server/agents/codex-app-server.ts",
  "lib/server/agents/universal-protocols.ts",
  "lib/domain/client-manifest.ts",
  "app/api/client-manifest/route.ts",
  "scripts/bootstrap-superadmin.mjs",
  "apps/mobile/package.json",
  "apps/mobile/app/index.tsx",
  "apps/desktop/src-tauri/src/main.rs",
  "docs/UNIVERSAL_ARCHITECTURE.md",
  "docs/STORE_RELEASE.md"
];
await Promise.all(required.map((file) => access(file)));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const script of ["engine:build", "engine:test", "admin:bootstrap", "universal:contract", "mobile:typecheck", "desktop:check"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`Missing package script ${script}`);
}
const premium = await readFile("components/app/premium-prosmet-application.tsx", "utf8");
if (!premium.includes("verifyEstimateWithRust")) throw new Error("Rust approval gate is not wired into the estimate workflow");
const providers = await readFile("lib/server/services/providers.ts", "utf8");
for (const kind of ["codex-app-server", "a2a", "ag-ui"]) {
  if (!providers.includes(`\"${kind}\"`)) throw new Error(`Missing universal provider ${kind}`);
}
console.log(JSON.stringify({ ok: true, contract: "universal-platform-v1", requiredFiles: required.length }, null, 2));
