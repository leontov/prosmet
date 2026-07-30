import { access, readFile } from "node:fs/promises";

const root = process.cwd();

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function requireFile(path) {
  await access(new URL(`../${path}`, import.meta.url));
}

function assertMatch(path, content, pattern, message) {
  if (!pattern.test(content)) {
    throw new Error(`${path}: ${message}`);
  }
}

const toolkit = await source("app/toolkit.tsx");
const background = await source("components/tools/background-artifact.tsx");
const developerWorkspace = await source("components/tools/developer-workspace.tsx");
const serviceCommand = await source("lib/server/service-command.ts");
const registry = await source("lib/server/a2a/registry.ts");
const taskStore = await source("lib/server/a2a/task-store.ts");
const a2aRoute = await source("app/api/a2a/route.ts");
const agentCardRoute = await source("app/.well-known/agent-card.json/route.ts");
const styles = await source("app/globals.css");

assertMatch("app/toolkit.tsx", toolkit, /developer_workspace/, "developer workspace tool is not registered");
assertMatch("app/toolkit.tsx", toolkit, /BackgroundArtifact kind="technology"/, "technology still expands into the normal chat flow");
assertMatch("app/toolkit.tsx", toolkit, /BackgroundArtifact kind="review"/, "estimate review is not kept in the background");
assertMatch("components/tools/background-artifact.tsx", background, /data-prosmet-background-artifact/, "background artifacts are not explicitly marked");
assertMatch("components/tools/developer-workspace.tsx", developerWorkspace, /method: "message\/send"/, "developer UI does not create A2A tasks");
assertMatch("components/tools/developer-workspace.tsx", developerWorkspace, /owner-approved/, "owner approval contour is missing from developer UI");
assertMatch("lib/server/service-command.ts", serviceCommand, /load-developer-workspace/, "chat command cannot open developer mode");
assertMatch("lib/server/a2a/registry.ts", registry, /A2A_PROTOCOL_VERSION = "0\.3\.0"/, "A2A protocol version is not explicit");
assertMatch("lib/server/a2a/registry.ts", registry, /React Native Engineer/, "mobile development agent is missing");
assertMatch("lib/server/a2a/registry.ts", registry, /Release Engineer/, "release agent is missing");
assertMatch("lib/server/a2a/task-store.ts", taskStore, /taskKey\(ownerId/, "A2A tasks are not owner scoped");
assertMatch("app/api/a2a/route.ts", a2aRoute, /body\.method === "message\/send"/, "message/send is missing");
assertMatch("app/api/a2a/route.ts", a2aRoute, /body\.method === "tasks\/get"/, "tasks/get is missing");
assertMatch("app/api/a2a/route.ts", a2aRoute, /body\.method === "tasks\/cancel"/, "tasks/cancel is missing");
assertMatch("app/.well-known/agent-card.json/route.ts", agentCardRoute, /prosmetDeveloperAgentCard/, "Agent Card route is missing");
assertMatch("app/globals.css", styles, /estimate-document-overlay/, "responsive estimate sheet styles are missing");
assertMatch("app/globals.css", styles, /calc\(100vw - 340px\)/, "desktop side sheet contract is missing");
assertMatch("app/globals.css", styles, /94dvh/, "mobile bottom sheet contract is missing");

for (const path of [
  "docs/PRODUCT_SPEC_AND_ROADMAP.md",
  "docs/A2A_DEVELOPER_MODE.md",
  "e2e/estimate-compact-sheet.spec.ts"
]) {
  await requireFile(path);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      root,
      contract: "compact-estimate-sheet+a2a-developer-mode",
      checks: 21
    },
    null,
    2
  )
);
