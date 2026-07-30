import { access, readFile } from "node:fs/promises";

const root = process.cwd();
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const requireFile = (path) => access(new URL(`../${path}`, import.meta.url));

function need(path, source, token) {
  if (!source.includes(token)) throw new Error(`${path}:missing:${token}`);
}

const toolkit = await read("app/toolkit.tsx");
const background = await read("components/tools/background-artifact.tsx");
const developerWorkspace = await read("components/tools/developer-workspace.tsx");
const serviceCommand = await read("lib/server/service-command.ts");
const registry = await read("lib/server/a2a/registry.ts");
const taskStore = await read("lib/server/a2a/task-store.ts");
const a2aRoute = await read("app/api/a2a/route.ts");
const agentCardRoute = await read("app/.well-known/agent-card.json/route.ts");
const estimateWorkspaceStyles = await read("app/estimate-workspace.css");

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
need("app/estimate-workspace.css", estimateWorkspaceStyles, ".prosmet-estimate-sheet");
need("app/estimate-workspace.css", estimateWorkspaceStyles, ".prosmet-row-sheet");
need(
  "app/estimate-workspace.css",
  estimateWorkspaceStyles,
  'body[data-prosmet-estimate-open="true"] main'
);

for (const path of [
  "docs/PRODUCT_SPEC_AND_ROADMAP.md",
  "docs/A2A_DEVELOPER_MODE.md",
  "scripts/compact-estimate-workspace-contract.mjs",
  "e2e/compact-estimate-workspace.spec.ts",
  "e2e/estimate-compact-sheet.spec.ts"
]) {
  await requireFile(path);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      root,
      contract: "compact-estimate-workspace+a2a-developer-mode",
      checks: 23
    },
    null,
    2
  )
);
