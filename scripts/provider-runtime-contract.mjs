import { access, readFile } from "node:fs/promises";

const failures = [];
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};

for (const path of [
  "lib/server/agents/provider-contract.ts",
  "lib/server/agents/provider-executor.ts",
  "lib/server/agents/codex-cli.ts",
  "lib/server/agents/provider-contract.test.ts",
  "lib/server/agents/provider-executor.test.ts"
]) {
  await access(path);
}

const [route, providers, executor, codex, ui, toolkit, service, deployment] = await Promise.all([
  readFile("app/api/agent/route.ts", "utf8"),
  readFile("lib/server/services/providers.ts", "utf8"),
  readFile("lib/server/agents/provider-executor.ts", "utf8"),
  readFile("lib/server/agents/codex-cli.ts", "utf8"),
  readFile("components/tools/service-settings.tsx", "utf8"),
  readFile("app/toolkit.tsx", "utf8"),
  readFile("lib/server/service-command.ts", "utf8"),
  readFile("deployment/direct-primary.sh", "utf8")
]);

for (const token of [
  "prepareProviderRun",
  "executePreparedProvider",
  "providerConnectionId",
  "providerUsage",
  "X-Prosmet-Provider",
  "RUN_ERROR"
]) need(route, token, "agent-route");
forbid(route, 'process.env.PROSMET_DEFAULT_PROVIDER || "rules"', "agent-route");

for (const token of [
  '"codex-cli"',
  "getSelectedProviderRuntime",
  "decryptSecret(row)",
  "PROSMET_PROVIDER_MASTER_KEY",
  "selected_provider_unavailable"
]) need(providers, token, "provider-storage");

for (const token of [
  "/chat/completions",
  "/api/chat",
  "runCodexSemantic",
  "AbortSignal.any",
  "providerSystemPrompt"
]) need(executor, token, "provider-executor");
forbid(executor, "runRulesAgent", "provider-executor");

for (const token of [
  '"--sandbox"',
  '"read-only"',
  '"--output-schema"',
  '"--output-last-message"',
  '"--ignore-user-config"',
  '"--ignore-rules"',
  "child.kill(\"SIGTERM\")",
  "child.kill(\"SIGKILL\")",
  "CODEX_HOME"
]) need(codex, token, "codex-cli");
forbid(codex, "exec(", "codex-cli");
forbid(codex, "shell: true", "codex-cli");

need(ui, 'value="codex-cli"', "provider-ui");
need(toolkit, '"codex-cli"', "provider-toolkit");
need(service, 'return "codex-cli"', "provider-service-command");
need(deployment, "PROSMET_PROVIDER_MASTER_KEY", "deployment-secret");

if (failures.length) {
  console.error("PROVIDER RUNTIME CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PROVIDER RUNTIME CONTRACT PASS");
