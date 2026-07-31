import { access, readFile } from "node:fs/promises";

const root = process.cwd();
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const requireFile = (path) => access(new URL(`../${path}`, import.meta.url));

function need(path, source, token) {
  if (!source.includes(token)) throw new Error(`${path}:missing:${token}`);
}

function forbid(path, source, token) {
  if (source.includes(token)) throw new Error(`${path}:forbidden:${token}`);
}

const toolkit = await read("app/toolkit.tsx");
const background = await read("components/tools/background-artifact.tsx");
const developerWorkspace = await read("components/tools/developer-workspace.tsx");
const serviceCommand = await read("lib/server/service-command.ts");
const registry = await read("lib/server/a2a/registry.ts");
const taskStore = await read("lib/server/a2a/task-store.ts");
const a2aRoute = await read("app/api/a2a/route.ts");
const agentCardRoute = await read("app/.well-known/agent-card.json/route.ts");
const premiumWorkspaceStyles = `${await read("app/premium-product.css")}\n${await read("app/premium-product-fixes.css")}`;

need("app/toolkit.tsx", toolkit, "developer_workspace");
need("app/toolkit.tsx", toolkit, 'BackgroundArtifact kind="technology"');
need("app/toolkit.tsx", toolkit, 'BackgroundArtifact kind="review"');
need("components/tools/background-artifact.tsx", background, "data-prosmet-background-artifact");
need("components/tools/developer-workspace.tsx", developerWorkspace, 'method: "message/send"');
need("components/tools/developer-workspace.tsx", developerWorkspace, "owner-approved");
need("lib/server/service-command.ts", serviceCommand, "load-developer-workspace");
need("lib/server/a2a/registry.ts", registry, 'A2A_PROTOCOL_VERSION = "0.3.0"');
need("lib/server/a2a/registry.ts", registry, "React Native Engineer");
need("lib/server/a2a/registry.ts", registry, "Release Engineer");
need("lib/server/a2a/task-store.ts", taskStore, "taskKey(ownerId");
need("app/api/a2a/route.ts", a2aRoute, 'body.method === "message/send"');
need("app/api/a2a/route.ts", a2aRoute, 'body.method === "tasks/get"');
need("app/api/a2a/route.ts", a2aRoute, 'body.method === "tasks/cancel"');
need("app/api/a2a/route.ts", a2aRoute, 'body.method === "tasks/list"');
need("app/.well-known/agent-card.json/route.ts", agentCardRoute, "prosmetDeveloperAgentCard");
need("app/premium-product.css", premiumWorkspaceStyles, ".prosmet-v2-estimate-shell");
need("app/premium-product.css", premiumWorkspaceStyles, ".prosmet-v2-estimate-layout");
need("app/premium-product.css", premiumWorkspaceStyles, ".prosmet-v2-row-sheet");
need("app/premium-product.css", premiumWorkspaceStyles, ".prosmet-v2-mobile-nav");
forbid("app/premium-product.css", premiumWorkspaceStyles, 'body[data-prosmet-estimate-open="true"] main');
forbid("app/premium-product.css", premiumWorkspaceStyles, ".prosmet-estimate-sheet");

for (const path of [
  "docs/PRODUCT_SPEC_AND_ROADMAP.md",
  "docs/A2A_DEVELOPER_MODE.md",
  "docs/PREMIUM_UI_V2_BRIEF.md",
  "scripts/compact-estimate-workspace-contract.mjs",
  "e2e/compact-estimate-workspace.spec.ts",
  "e2e/estimate-compact-sheet.spec.ts",
  "e2e/premium-ui.spec.ts"
]) {
  await requireFile(path);
}

for (const legacyPath of ["app/estimate-workspace.css", "app/premium-foundation.css"]) {
  try {
    await requireFile(legacyPath);
    throw new Error(`${legacyPath}:legacy-file-present`);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith(":legacy-file-present")) throw error;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      root,
      contract: "premium-v2-estimate-workspace+a2a-developer-mode",
      checks: 27,
      legacyWorkspaceCss: "deleted"
    },
    null,
    2
  )
);