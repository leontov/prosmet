import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const required = [
  "@assistant-ui/react",
  "@assistant-ui/react-ag-ui",
  "@ag-ui/client",
  "@ag-ui/core",
  "next",
  "react",
  "drizzle-orm",
  "better-auth",
  "@sqlite.org/sqlite-wasm"
];
const missing = required.filter((name) => !pkg.dependencies?.[name]);
if (missing.length) throw new Error(`Source contract missing dependencies: ${missing.join(", ")}`);

const route = await readFile(new URL("app/api/agent/route.ts", root), "utf8");
const sse = await readFile(new URL("lib/agui/sse.ts", root), "utf8");
const runtime = await readFile(new URL("components/kolibri-runtime-provider.tsx", root), "utf8");
const toolkit = await readFile(new URL("components/toolkit.tsx", root), "utf8");
const estimateTool = await readFile(new URL("components/tools/estimate-draft-tool.tsx", root), "utf8");

if (!route.includes("RunAgentInputSchema") || !sse.includes("text/event-stream")) {
  throw new Error("AG-UI endpoint contract is incomplete");
}
if (!runtime.includes('url: "/api/agent"') || runtime.includes("/api/chat")) {
  throw new Error("Exactly one AG-UI transport endpoint is required");
}
for (const tool of ["technology_card", "estimate_draft", "estimate_review", "commercial_proposal", "contract_draft"]) {
  if (!toolkit.includes(tool)) throw new Error(`Toolkit renderer missing: ${tool}`);
}
if (!estimateTool.includes("useAgUiSetState") || !estimateTool.includes("saveEstimateRevision")) {
  throw new Error("Interactive estimate must update AG-UI state and immutable revisions");
}

const evalCatalogue = await readFile(new URL("tests/evals/catalog.ts", root), "utf8");
const evalCount = (evalCatalogue.match(/id:\s*"E\d{3}"/g) ?? []).length;
if (evalCount < 50) throw new Error(`At least 50 AI eval cases are required; found ${evalCount}`);

const forbiddenPatterns = [/MiMo[^\n]{0,20}(?:key|token)\s*[:=]\s*["'][^"']+/i, /sk-[A-Za-z0-9_-]{20,}/];
async function walk(relative) {
  const directory = new URL(relative, root);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const next = join(relative, entry.name);
    if (entry.isDirectory()) await walk(`${next}/`);
    else if (/\.(?:ts|tsx|js|mjs|md|yml|yaml|json)$/.test(entry.name)) {
      const contents = await readFile(new URL(next, root), "utf8");
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(contents)) throw new Error(`Possible committed secret in ${next}`);
      }
    }
  }
}
await walk("app/");
await walk("components/");
await walk("lib/");

console.log("source-contract: PASS", {
  requiredDependencies: required.length,
  endpoint: "/api/agent",
  interactiveEstimate: true,
  aiEvalCases: evalCount
});
