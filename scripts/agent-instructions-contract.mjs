import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

const read = (path) => readFile(resolve(root, path), "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};

const requiredFiles = [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".github/pull_request_template.md",
  "docs/AGENT_ENGINEERING_PLAYBOOK.md",
  "docs/AGENT_CONTEXT_INDEX.md",
  "docs/AGENT_TASK_TEMPLATE.md",
  "docs/PRODUCT_SPEC_AND_ROADMAP.md",
  "docs/UX_PREMIUM_FOUNDATION_V1.md",
  "docs/A2A_DEVELOPER_MODE.md"
];

for (const path of requiredFiles) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const agents = await read("AGENTS.md");
for (const token of [
  "leontov/prosmet",
  "https://kolibriai.online",
  "prosmet-primary",
  "MAIN PRODUCTION PASS",
  "assistant-ui",
  "AG-UI",
  "PostgreSQL",
  "IndexedDB",
  "технологическая карта формируется до сметы",
  "observe → reproduce → fix → verify → deploy → live verify → evidence",
  "PROSMET UX PREMIUM FOUNDATION V1",
  "discover → read → propose → code → test → git → deploy"
]) {
  need(agents, token, "agents-root");
}
for (const token of [
  "считать готовым по коммиту",
  "deploy feature branch",
  "browser SQLite",
  "silent fallback"
]) {
  need(agents, token, "agents-safety");
}

const playbook = await read("docs/AGENT_ENGINEERING_PLAYBOOK.md");
for (const token of [
  "Phase A — Observe",
  "Failure loop",
  "External blocker",
  "UX Premium checklist",
  "Estimate domain checklist",
  "Definition of Done"
]) {
  need(playbook, token, "agent-playbook");
}

const context = await read("docs/AGENT_CONTEXT_INDEX.md");
for (const token of [
  "rd8r8bkd9m-tech/kolibri-project-main",
  "не является source of truth",
  "PostgreSQL остаётся server authority",
  "Как определить актуальный статус"
]) {
  need(context, token, "agent-context");
}

const taskTemplate = await read("docs/AGENT_TASK_TEMPLATE.md");
for (const token of [
  "base_sha",
  "current_evidence",
  "permission_requested",
  "regression_guard",
  "main_production_pass"
]) {
  need(taskTemplate, token, "agent-task-template");
}

const copilot = await read(".github/copilot-instructions.md");
need(copilot, "Перед любым изменением обязательно прочитай `/AGENTS.md`", "copilot");
need(copilot, "Не добавляй новые большие продуктовые модули", "copilot");
need(copilot, "public exact-SHA release", "copilot");

const pr = await read(".github/pull_request_template.md");
need(pr, "Verified blocker", "pull-request-template");
need(pr, "Public HTTPS exact release SHA", "pull-request-template");
need(pr, "MAIN PRODUCTION PASS", "pull-request-template");

forbid(agents, "localhost:3100", "production-port");
forbid(copilot, "SQLite-WASM is required", "browser-storage");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "prosmet-agent-development-instructions-v1",
      repository: "leontov/prosmet",
      completion: "MAIN PRODUCTION PASS exact main SHA",
      documents: requiredFiles.length
    },
    null,
    2
  )
);