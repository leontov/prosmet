import { readFile } from "node:fs/promises";

const failures = [];
const read = (path) => readFile(path, "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};

const [runtime, compat, tsconfig, agent, health, backend] = await Promise.all([
  read("lib/server/postgres-runtime.ts"),
  read("lib/server/postgres-compat.ts"),
  read("tsconfig.json"),
  read("app/api/agent/route.ts"),
  read("app/api/health/route.ts"),
  read("app/api/backend/status/route.ts")
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

need(
  tsconfig,
  '"@/lib/server/postgres": ["./lib/server/postgres-compat.ts"]',
  "postgres-path-alias"
);
need(agent, 'from "@/lib/server/postgres"', "agent-runtime-import");
need(health, "checkServerDatabase", "health-runtime-import");
need(backend, "checkServerDatabase", "backend-runtime-import");

if (failures.length) {
  console.error("SERVER RUNTIME CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SERVER RUNTIME CONTRACT PASS");
