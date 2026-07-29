import { readFile } from "node:fs/promises";

const [runtime, tsconfig, vitest] = await Promise.all([
  readFile("lib/server/rules-agent-runtime.ts", "utf8"),
  readFile("tsconfig.json", "utf8"),
  readFile("vitest.config.ts", "utf8")
]);

const failures = [];
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};

for (const token of [
  "comparisonRun",
  "executionRun",
  "reserveMutation",
  "askForInput",
  "patchDemolitionCompleteness",
  'name: "estimate_comparison"',
  'name: "execution_progress"',
  'name: "ask_user"',
  'path: "/activeEstimate"',
  "runCoreRulesAgent"
]) {
  need(runtime, token, "rules-agent-runtime");
}

need(
  tsconfig,
  '"@/lib/server/rules-agent": ["./lib/server/rules-agent-runtime.ts"]',
  "typescript-rules-agent-alias"
);
need(
  vitest,
  '"@/lib/server/rules-agent": fileURLToPath(',
  "vitest-rules-agent-alias"
);

if (failures.length) {
  console.error("RULES AGENT RUNTIME CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("RULES AGENT RUNTIME CONTRACT PASS");
