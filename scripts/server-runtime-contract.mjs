import { access, readFile } from "node:fs/promises";

const failures = [];
const read = (path) => readFile(path, "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};

const [runtime, compat, priceCompat, tsconfig, agent, health, backend, sync, editor] =
  await Promise.all([
    read("lib/server/postgres-runtime.ts"),
    read("lib/server/postgres-compat.ts"),
    read("lib/server/price-intelligence-compat.ts"),
    read("tsconfig.json"),
    read("app/api/agent/route.ts"),
    read("app/api/health/route.ts"),
    read("app/api/backend/status/route.ts"),
    read("app/api/sync/route.ts"),
    read("components/tools/estimate-document-experience.tsx")
  ]);

for (const token of [
  "beginAgentRun",
  "finishAgentRun",
  "checkServerDatabase",
  "prosmet_agent_runs",
  "ensureServerSchema",
  "SELECT 1"
]) {
  need(runtime, token, "postgres-runtime");
}

for (const token of [
  'export * from "./postgres"',
  "beginAgentRun",
  "finishAgentRun",
  "checkServerDatabase"
]) {
  need(compat, token, "postgres-compat");
}

for (const token of [
  "PRICE_INTELLIGENCE_COMPAT_SQL",
  "prosmet_canonical_works",
  "prosmet_price_observations",
  "prosmet_estimate_item_price_history",
  "prosmet_market_price_buckets",
  "ensurePriceIntelligenceSchemaCore",
  "materializePriceIntelligenceCore"
]) {
  need(priceCompat, token, "price-intelligence-compat");
}

need(
  tsconfig,
  '"@/lib/server/postgres": ["./lib/server/postgres-compat.ts"]',
  "postgres-path-alias"
);
need(
  tsconfig,
  '"@/lib/server/price-intelligence": ["./lib/server/price-intelligence-compat.ts"]',
  "price-intelligence-path-alias"
);
need(agent, 'from "@/lib/server/postgres"', "agent-runtime-import");
need(health, "checkServerDatabase", "health-runtime-import");
need(backend, "checkServerDatabase", "backend-runtime-import");
need(sync, 'from "@/lib/server/price-intelligence"', "sync-price-intelligence-import");

for (const token of [
  "EstimateArtifactCard",
  "EstimateDocumentOverlay",
  "EstimateDocumentCanvas",
  "EstimateLineRow",
  "EstimateRowDetailsSheet",
  "PriceInspector",
  "EstimateRevisionPreview"
]) {
  need(editor, token, "estimate-editor-v2");
}
forbid(
  editor,
  '<button type="button" onClick={onOpenPrice} className="group/price',
  "estimate-price-cell"
);

for (const obsolete of [
  "components/tools/estimate-document-v2.tsx",
  "components/tools/estimate-document-v2-shell.tsx",
  "components/tools/estimate-document-v2.module.css"
]) {
  try {
    await access(obsolete);
    failures.push(`obsolete-editor:${obsolete}`);
  } catch {
    // Expected: there is only one production estimate editor.
  }
}

if (failures.length) {
  console.error("SERVER RUNTIME CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SERVER RUNTIME CONTRACT PASS");
