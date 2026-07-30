import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const requiredFiles = [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  "docs/agents/README.md",
  "docs/agents/PROJECT_CONTEXT.md",
  "docs/agents/ARCHITECTURE.md",
  "docs/agents/EXECUTION_PROTOCOL.md",
  "docs/agents/UX_PRODUCT_RULES.md",
  "docs/agents/CODE_CONVENTIONS.md",
  "docs/agents/QUALITY_RELEASE_GATE.md",
  "docs/agents/A2A_ROLES.md",
  "docs/agents/SECURITY_PERMISSIONS.md",
  "docs/agents/OPERATIONS_RUNBOOK.md",
  "docs/agents/AGENT_BOOTSTRAP_PROMPT.md",
  "docs/agents/INSTRUCTION_MANIFEST.json"
];

const source = async (path) => readFile(resolve(root, path), "utf8");
const normalized = (value) => value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ");

for (const path of requiredFiles) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

async function requireConcept(path, patterns) {
  let text;
  try {
    text = normalized(await source(path));
  } catch {
    return;
  }
  for (const [label, pattern] of patterns) {
    if (!pattern.test(text)) failures.push(`${path}:missing-concept:${label}`);
  }
}

await requireConcept(".github/copilot-instructions.md", [
  ["single assistant runtime", /assistant-ui.*runtime/],
  ["AG-UI transport", /ag-ui.*sse/],
  ["PostgreSQL canonical state", /postgresql.*canonical/],
  ["IndexedDB local-first", /indexeddb.*local-first/],
  ["no browser SQL/WASM", /browser sql\/wasm.*запрещ/],
  ["exact SHA production completion", /exact.*sha.*production/],
  ["canonical HTTPS origin", /https:\/\/kolibriai\.online/]
]);

await requireConcept("docs/agents/EXECUTION_PROTOCOL.md", [
  ["observable outcome", /наблюдаем.*результат/],
  ["baseline E2E", /baseline e2e/],
  ["independent verification", /независим.*проверк/],
  ["continue to green gate", /main production pass/],
  ["external blocker discipline", /внешн.*блокер/]
]);

await requireConcept("docs/agents/QUALITY_RELEASE_GATE.md", [
  ["source contract", /source contract/],
  ["desktop mobile Chromium", /desktop.*mobile.*chromium/],
  ["HTTPS gate", /https gate/],
  ["visual regression", /visual regression/],
  ["accessibility", /accessibility/],
  ["performance", /performance/],
  ["exact SHA equality", /main sha.*api\/health.*releasesha/]
]);

await requireConcept("docs/agents/SECURITY_PERMISSIONS.md", [
  ["tenant isolation", /tenant/],
  ["default deny", /default deny/],
  ["secret isolation", /секрет.*browser/],
  ["owner approval", /owner approval/],
  ["capability gateway", /capability gateway/]
]);

await requireConcept("docs/agents/UX_PRODUCT_RULES.md", [
  ["compact estimate card", /компактн.*карточк.*смет/],
  ["44px touch policy", /44.*px/],
  ["keyboard safe", /keyboard-safe/],
  ["Russian localization", /30\.07\.2026/],
  ["separate business actions", /сохранить версию.*утвердить.*передать клиенту/]
]);

try {
  const manifest = JSON.parse(await source("docs/agents/INSTRUCTION_MANIFEST.json"));
  if (manifest.repository !== "leontov/prosmet") failures.push("manifest:repository");
  if (manifest.canonicalOrigin !== "https://kolibriai.online") failures.push("manifest:canonicalOrigin");
  if (manifest.productionBranch !== "main") failures.push("manifest:productionBranch");
  if (manifest.productionRunner !== "prosmet-primary") failures.push("manifest:productionRunner");
  if (manifest.architecture?.browserSqlWasmAllowed !== false) failures.push("manifest:browserSqlWasmAllowed");
  if (manifest.currentReleaseConstraint?.newProductModulesAllowed !== false) {
    failures.push("manifest:newProductModulesAllowed");
  }
  const readOrder = Array.isArray(manifest.readOrder) ? new Set(manifest.readOrder) : new Set();
  for (const path of requiredFiles.filter((path) => path.endsWith(".md"))) {
    const absolute = `/${path}`;
    if (path !== "AGENTS.md" && !readOrder.has(absolute)) failures.push(`manifest:readOrder:${absolute}`);
  }
} catch (error) {
  failures.push(`manifest:invalid:${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "agent-project-instructions-v1", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "agent-project-instructions-v1",
      files: requiredFiles.length,
      canonicalOrigin: "https://kolibriai.online",
      completion: "green exact-SHA production gate"
    },
    null,
    2
  )
);
