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
  "CLAUDE.md",
  "GEMINI.md",
  "MIMO.md",
  ".github/copilot-instructions.md",
  ".github/pull_request_template.md",
  "docs/AGENT_BOOTSTRAP_PROMPT.md",
  "docs/AGENT_ENGINEERING_PLAYBOOK.md",
  "docs/AGENT_CONTEXT_INDEX.md",
  "docs/AGENT_TASK_TEMPLATE.md",
  "docs/PROJECT_SOURCE_OF_TRUTH.md",
  "docs/WRITE_ACTIONS_RECOVERY.md",
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

const sourceOfTruth = await read("docs/PROJECT_SOURCE_OF_TRUTH.md");
for (const token of [
  "Требования и фактическое состояние — разные источники",
  "exact SHA ветки `main`",
  "A2A task или development plan не означает выполненное изменение",
  "Что является legacy",
  "MAIN PRODUCTION PASS"
]) {
  need(sourceOfTruth, token, "project-source-of-truth");
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

const bootstrap = await read("docs/AGENT_BOOTSTRAP_PROMPT.md");
for (const token of [
  "Не начинай новый bootstrap",
  "PROSMET UX PREMIUM FOUNDATION V1",
  "MAIN PRODUCTION PASS",
  "exact main SHA"
]) {
  need(bootstrap, token, "agent-bootstrap");
}

const writeRecovery = await read("docs/WRITE_ACTIONS_RECOVERY.md");
for (const token of [
  "Write-actions и `GITHUB_TOKEN` workflow — разные контуры",
  "Contents: write",
  "HTTP 409",
  "Branch protection и rulesets",
  "Server permissions — отдельный контур",
  "MAIN PRODUCTION PASS"
]) {
  need(writeRecovery, token, "write-actions-recovery");
}

const copilot = await read(".github/copilot-instructions.md");
need(copilot, "Перед любым изменением обязательно прочитай `/AGENTS.md`", "copilot");
need(copilot, "Не добавляй новые большие продуктовые модули", "copilot");
need(copilot, "public exact-SHA release", "copilot");

const claude = await read("CLAUDE.md");
need(claude, "AGENTS.md", "claude-entrypoint");
need(claude, "MAIN PRODUCTION PASS", "claude-entrypoint");

const gemini = await read("GEMINI.md");
need(gemini, "AGENTS.md", "gemini-entrypoint");
need(gemini, "MAIN PRODUCTION PASS", "gemini-entrypoint");

const mimo = await read("MIMO.md");
need(mimo, "AGENTS.md", "mimo-entrypoint");
need(mimo, "docs/PROJECT_SOURCE_OF_TRUTH.md", "mimo-entrypoint");
need(mimo, "MAIN PRODUCTION PASS", "mimo-entrypoint");

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
      contract: "prosmet-agent-development-instructions-v2",
      repository: "leontov/prosmet",
      completion: "MAIN PRODUCTION PASS exact main SHA",
      documents: requiredFiles.length,
      entrypoints: ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "MIMO.md", ".github/copilot-instructions.md"]
    },
    null,
    2
  )
);
