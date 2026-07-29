import { readFile, writeFile } from "node:fs/promises";

async function replace(path, before, after, label) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`${label} marker was not found in ${path}`);
  await writeFile(path, source.replace(before, after), "utf8");
}

await replace(
  "lib/server/services/providers.ts",
  `import { z } from "zod";`,
  `import { z } from "zod";\nimport { checkCodexCli } from "@/lib/server/agents/codex-cli";`,
  "provider import"
);

await replace(
  "lib/server/services/providers.ts",
  `  "ollama"\n]);`,
  `  "ollama",\n  "codex-cli"\n]);`,
  "provider kind"
);

await replace(
  "lib/server/services/providers.ts",
  `    if (value.kind !== "rules" && !value.baseUrl) {`,
  `    if (!["rules", "codex-cli"].includes(value.kind) && !value.baseUrl) {`,
  "provider base URL validation"
);

await replace(
  "lib/server/services/providers.ts",
  `export type ProviderConnection = {\n  id: string;\n  kind: ProviderKind;\n  name: string;\n  baseUrl: string;\n  model: string;\n  status: "connected" | "disconnected" | "error" | "unchecked";\n  selected: boolean;\n  hasSecret: boolean;\n  lastError: string | null;\n  lastCheckedAt: string | null;\n  updatedAt: string;\n};`,
  `export type ProviderConnection = {\n  id: string;\n  kind: ProviderKind;\n  name: string;\n  baseUrl: string;\n  model: string;\n  status: "connected" | "disconnected" | "error" | "unchecked";\n  selected: boolean;\n  hasSecret: boolean;\n  lastError: string | null;\n  lastCheckedAt: string | null;\n  updatedAt: string;\n};\n\nexport type ProviderRuntimeConnection = ProviderConnection & {\n  apiKey: string;\n};`,
  "provider runtime type"
);

await replace(
  "lib/server/services/providers.ts",
  `  const raw = process.env.PROSMET_MASTER_KEY?.trim();`,
  `  const raw = (process.env.PROSMET_MASTER_KEY ?? process.env.PROSMET_PROVIDER_MASTER_KEY)?.trim();`,
  "provider master key"
);

await replace(
  "lib/server/services/providers.ts",
  `  if (kind === "rules") return "";`,
  `  if (kind === "rules" || kind === "codex-cli") return "";`,
  "provider URL normalization"
);

await replace(
  "lib/server/services/providers.ts",
  `  if (input.kind === "rules") {\n    return {\n      connected: true,\n      detail: "Встроенный детерминированный сметный сервис доступен."\n    };\n  }\n\n  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);`,
  `  if (input.kind === "rules") {\n    return {\n      connected: true,\n      detail: "Встроенный детерминированный сметный сервис доступен."\n    };\n  }\n  if (input.kind === "codex-cli") return checkCodexCli();\n\n  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);`,
  "Codex provider health"
);

const providersPath = "lib/server/services/providers.ts";
let providers = await readFile(providersPath, "utf8");
const appendMarker = `export function providerErrorCode(error: unknown) {\n  return error instanceof ProviderConfigurationError\n    ? error.code\n    : "provider_operation_failed";\n}`;
if (!providers.includes(appendMarker)) throw new Error("Provider tail marker was not found");
providers = providers.replace(
  appendMarker,
  `${appendMarker}\n\nfunction defaultRulesRuntime(): ProviderRuntimeConnection {\n  return {\n    id: "provider:rules:default",\n    kind: "rules",\n    name: "Встроенный сметный сервис",\n    baseUrl: "",\n    model: "prosmet-chief-estimator-v2",\n    status: "connected",\n    selected: true,\n    hasSecret: false,\n    lastError: null,\n    lastCheckedAt: null,\n    updatedAt: new Date().toISOString(),\n    apiKey: ""\n  };\n}\n\nexport async function getSelectedProviderRuntime(\n  tenantId: string\n): Promise<ProviderRuntimeConnection> {\n  if (!postgresConfigured()) return defaultRulesRuntime();\n  await ensureTenant(tenantId);\n  const result = await (await getServerDatabase()).query<ProviderRow>(\n    \`SELECT id, kind, name, base_url, model, status, selected,\n            secret_ciphertext, secret_iv, secret_tag, last_error,\n            last_checked_at, updated_at\n       FROM prosmet_provider_connections\n      WHERE tenant_id = $1 AND selected = TRUE\n      ORDER BY updated_at DESC\n      LIMIT 1\`,\n    [tenantId]\n  );\n  const row = result.rows[0];\n  if (!row) return defaultRulesRuntime();\n  if (row.status !== "connected") {\n    throw new ProviderConfigurationError(\n      "selected_provider_unavailable",\n      row.last_error || "Выбранный AI-провайдер не прошёл проверку соединения."\n    );\n  }\n  return {\n    ...publicConnection(row),\n    apiKey: decryptSecret(row)\n  };\n}`
);
await writeFile(providersPath, providers, "utf8");

await replace(
  "components/tools/service-settings.tsx",
  `type ProviderKind = "rules" | "mimo" | "openai-compatible" | "ollama";`,
  `type ProviderKind = "rules" | "mimo" | "openai-compatible" | "ollama" | "codex-cli";`,
  "provider UI type"
);
await replace(
  "components/tools/service-settings.tsx",
  `    hint === "ollama" || hint === "openai-compatible" || hint === "rules"`,
  `    hint === "ollama" || hint === "openai-compatible" || hint === "codex-cli" || hint === "rules"`,
  "provider UI hint"
);
await replace(
  "components/tools/service-settings.tsx",
  `                <option value="ollama">Ollama на сервере</option>\n                <option value="rules">Встроенный сметный сервис</option>`,
  `                <option value="ollama">Ollama на сервере</option>\n                <option value="codex-cli">Codex CLI · ChatGPT на Primary</option>\n                <option value="rules">Встроенный сметный сервис</option>`,
  "provider UI option"
);
await replace(
  "components/tools/service-settings.tsx",
  `{form.kind !== "rules" ? (\n              <Field label="Server-side endpoint">`,
  `{form.kind !== "rules" && form.kind !== "codex-cli" ? (\n              <Field label="Server-side endpoint">`,
  "provider endpoint visibility"
);
await replace(
  "components/tools/service-settings.tsx",
  `            Codex desktop не подключается как модель. Для OpenAI используется официальный API; MiMo и Ollama работают через отдельные server-side adapters.`,
  `            MiMo, OpenAI-compatible и Ollama работают server-side. Codex CLI запускается только в изолированном read-only workspace Primary и использует server-side вход ChatGPT.`,
  "provider security note"
);
await replace(
  "components/tools/service-settings.tsx",
  `  if (kind === "rules") {`,
  `  if (kind === "codex-cli") {\n    return {\n      kind,\n      name: "Codex CLI · ChatGPT",\n      baseUrl: "",\n      model: "",\n      apiKey: "",\n      selected: true\n    };\n  }\n  if (kind === "rules") {`,
  "Codex provider defaults"
);

await replace(
  "app/toolkit.tsx",
  `providerHint: z.enum(["mimo", "openai-compatible", "ollama", "rules"]).optional()`,
  `providerHint: z.enum(["mimo", "openai-compatible", "ollama", "codex-cli", "rules"]).optional()`,
  "toolkit provider hint"
);
await replace(
  "lib/server/service-command.ts",
  `  if (/openai|codex|кодекс/.test(value)) return "openai-compatible";`,
  `  if (/codex|кодекс/.test(value)) return "codex-cli";\n  if (/openai/.test(value)) return "openai-compatible";`,
  "service command Codex hint"
);

console.log("Provider runtime, Codex UI and selected-provider access materialized");
