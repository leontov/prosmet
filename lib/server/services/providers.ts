import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import { z } from "@/lib/zod";
import { checkCodexCli } from "@/lib/server/agents/codex-cli";
import { checkCodexAppServer } from "@/lib/server/agents/codex-app-server";
import { probeUniversalAgent } from "@/lib/server/agents/universal-protocols";
import {
  ensureTenant,
  getServerDatabase,
  postgresConfigured,
  withServerTransaction,
  writeAuditEvent
} from "@/lib/server/postgres";

export const ProviderKindSchema = z.enum([
  "rules",
  "mimo",
  "openai-compatible",
  "ollama",
  "codex-cli",
  "codex-app-server",
  "a2a",
  "ag-ui"
]);

export const ProviderConnectionInputSchema = z
  .object({
    id: z.string().trim().regex(/^[a-zA-Z0-9:_-]{4,160}$/).optional(),
    kind: ProviderKindSchema,
    name: z.string().trim().min(2).max(160),
    baseUrl: z.string().trim().max(500).optional().default(""),
    model: z.string().trim().max(240).optional().default(""),
    apiKey: z.string().trim().max(16_384).optional(),
    selected: z.boolean().optional().default(false),
    test: z.boolean().optional().default(true)
  })
  .superRefine((value, context) => {
    if (!["rules", "codex-cli", "codex-app-server"].includes(value.kind) && !value.baseUrl) {
      context.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "Укажите server-side endpoint провайдера."
      });
    }
    if (["mimo", "openai-compatible"].includes(value.kind) && !value.model) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Укажите модель."
      });
    }
  });

export type ProviderKind = z.infer<typeof ProviderKindSchema>;
export type ProviderConnectionInput = z.infer<typeof ProviderConnectionInputSchema>;

export type ProviderConnection = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  status: "connected" | "disconnected" | "error" | "unchecked";
  selected: boolean;
  hasSecret: boolean;
  lastError: string | null;
  lastCheckedAt: string | null;
  updatedAt: string;
};

export type ProviderRuntimeConnection = ProviderConnection & {
  apiKey: string;
};

type ProviderRow = {
  id: string;
  kind: string;
  name: string;
  base_url: string | null;
  model: string | null;
  status: string;
  selected: boolean;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_tag: string | null;
  last_error: string | null;
  last_checked_at: Date | string | null;
  updated_at: Date | string;
};

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

class ProviderConfigurationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
    this.code = code;
  }
}

function encryptionKey() {
  const raw = (process.env.PROSMET_MASTER_KEY ?? process.env.PROSMET_PROVIDER_MASTER_KEY)?.trim();
  if (!raw || raw.length < 24) {
    throw new ProviderConfigurationError(
      "secret_store_not_configured",
      "На сервере не настроен PROSMET_MASTER_KEY. Ключ провайдера не сохранён."
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptSecret(row: ProviderRow) {
  if (!row.secret_ciphertext || !row.secret_iv || !row.secret_tag) return "";
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.secret_iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(row.secret_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function publicConnection(row: ProviderRow): ProviderConnection {
  const kind = ProviderKindSchema.parse(row.kind);
  const status = ["connected", "disconnected", "error", "unchecked"].includes(
    row.status
  )
    ? (row.status as ProviderConnection["status"])
    : "unchecked";
  return {
    id: row.id,
    kind,
    name: row.name,
    baseUrl: row.base_url ?? "",
    model: row.model ?? "",
    status,
    selected: row.selected,
    hasSecret: Boolean(row.secret_ciphertext),
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at
      ? new Date(row.last_checked_at).toISOString()
      : null,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function normalizedBaseUrl(kind: ProviderKind, value: string) {
  if (kind === "rules" || kind === "codex-cli" || kind === "codex-app-server") return "";
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ProviderConfigurationError(
      "invalid_provider_url",
      "Endpoint должен использовать HTTP или HTTPS."
    );
  }
  if (url.username || url.password) {
    throw new ProviderConfigurationError(
      "invalid_provider_url",
      "Не помещайте логин или секрет в URL."
    );
  }
  if (
    kind !== "ollama" &&
    url.protocol !== "https:" &&
    process.env.PROSMET_ALLOW_INSECURE_PROVIDER_HTTP !== "true"
  ) {
    throw new ProviderConfigurationError(
      "provider_https_required",
      "Для внешнего AI-провайдера требуется HTTPS."
    );
  }
  return url.toString().replace(/\/$/, "");
}

async function boundedResponseText(response: Response) {
  const value = await response.text();
  return value.slice(0, 2_000);
}

async function checkProvider(input: {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;
}) {
  if (input.kind === "rules") {
    return {
      connected: true,
      detail: "Встроенный детерминированный сметный сервис доступен."
    };
  }
  if (input.kind === "codex-cli") return checkCodexCli();
  if (input.kind === "codex-app-server") return checkCodexAppServer();

  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);
  if (input.kind === "a2a" || input.kind === "ag-ui") {
    return probeUniversalAgent({
      id: "probe", kind: input.kind, name: input.kind, baseUrl, model: input.model,
      status: "unchecked", selected: false, hasSecret: Boolean(input.apiKey),
      lastError: null, lastCheckedAt: null, updatedAt: new Date().toISOString(), apiKey: input.apiKey
    });
  }
  const endpoint =
    input.kind === "ollama" ? `${baseUrl}/api/tags` : `${baseUrl}/models`;
  const headers = new Headers({ Accept: "application/json" });
  if (input.kind !== "ollama") {
    if (!input.apiKey) {
      throw new ProviderConfigurationError(
        "provider_secret_required",
        "Для этого провайдера требуется API-ключ."
      );
    }
    headers.set("Authorization", `Bearer ${input.apiKey}`);
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) {
    const detail = await boundedResponseText(response);
    throw new ProviderConfigurationError(
      "provider_health_failed",
      `Провайдер ответил ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }
  await boundedResponseText(response);
  return {
    connected: true,
    detail:
      input.kind === "ollama"
        ? "Ollama отвечает с Primary."
        : `Endpoint моделей доступен${input.model ? ` · ${input.model}` : ""}.`
  };
}

async function providerRow(tenantId: string, id: string) {
  const result = await (await getServerDatabase()).query<ProviderRow>(
    `SELECT id, kind, name, base_url, model, status, selected,
            secret_ciphertext, secret_iv, secret_tag, last_error,
            last_checked_at, updated_at
     FROM prosmet_provider_connections
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return result.rows[0] ?? null;
}

export async function listProviderConnections(tenantId: string) {
  if (!postgresConfigured()) {
    return {
      storage: "unavailable" as const,
      selectedId: null,
      connections: [] as ProviderConnection[]
    };
  }
  await ensureTenant(tenantId);
  const result = await (await getServerDatabase()).query<ProviderRow>(
    `SELECT id, kind, name, base_url, model, status, selected,
            secret_ciphertext, secret_iv, secret_tag, last_error,
            last_checked_at, updated_at
     FROM prosmet_provider_connections
     WHERE tenant_id = $1
     ORDER BY selected DESC, updated_at DESC`,
    [tenantId]
  );
  const connections = result.rows.map(publicConnection);
  return {
    storage: "postgres" as const,
    selectedId: connections.find((connection) => connection.selected)?.id ?? null,
    connections
  };
}

export async function saveProviderConnection(
  tenantId: string,
  rawInput: unknown
) {
  if (!postgresConfigured()) {
    throw new ProviderConfigurationError(
      "provider_storage_unavailable",
      "PostgreSQL для AI-провайдеров не настроен."
    );
  }
  const input = ProviderConnectionInputSchema.parse(rawInput);
  await ensureTenant(tenantId);
  const id = input.id ?? `provider_${randomUUID()}`;
  const existing = await providerRow(tenantId, id);
  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);
  let secret = input.apiKey ?? "";
  if (!secret && existing?.secret_ciphertext) secret = decryptSecret(existing);
  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;

  let status: ProviderConnection["status"] = "unchecked";
  let lastError: string | null = null;
  if (input.test) {
    try {
      await checkProvider({
        kind: input.kind,
        baseUrl,
        model: input.model,
        apiKey: secret
      });
      status = "connected";
    } catch (error) {
      status = "error";
      lastError = error instanceof Error ? error.message : "Проверка провайдера не выполнена.";
    }
  }

  await withServerTransaction(async (database) => {
    if (input.selected) {
      await database.query(
        `UPDATE prosmet_provider_connections
         SET selected = FALSE, updated_at = NOW()
         WHERE tenant_id = $1`,
        [tenantId]
      );
    }
    await database.query(
      `INSERT INTO prosmet_provider_connections
        (tenant_id, id, kind, name, base_url, model, status, selected,
         secret_ciphertext, secret_iv, secret_tag, last_error,
         last_checked_at, metadata_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, NOW(), $13::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         kind = EXCLUDED.kind,
         name = EXCLUDED.name,
         base_url = EXCLUDED.base_url,
         model = EXCLUDED.model,
         status = EXCLUDED.status,
         selected = EXCLUDED.selected,
         secret_ciphertext = COALESCE(EXCLUDED.secret_ciphertext, prosmet_provider_connections.secret_ciphertext),
         secret_iv = COALESCE(EXCLUDED.secret_iv, prosmet_provider_connections.secret_iv),
         secret_tag = COALESCE(EXCLUDED.secret_tag, prosmet_provider_connections.secret_tag),
         last_error = EXCLUDED.last_error,
         last_checked_at = NOW(),
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()`,
      [
        tenantId,
        id,
        input.kind,
        input.name,
        baseUrl || null,
        input.model || null,
        status,
        input.selected,
        encrypted?.ciphertext ?? null,
        encrypted?.iv ?? null,
        encrypted?.tag ?? null,
        lastError,
        JSON.stringify({ tested: input.test })
      ]
    );
  });

  await writeAuditEvent({
    tenantId,
    action: existing ? "provider.updated" : "provider.connected",
    entityType: "provider_connection",
    entityId: id,
    details: {
      kind: input.kind,
      model: input.model,
      selected: input.selected,
      status,
      secretChanged: Boolean(input.apiKey)
    }
  });

  const saved = await providerRow(tenantId, id);
  if (!saved) throw new Error("Provider connection was not saved");
  return publicConnection(saved);
}

export async function selectProviderConnection(tenantId: string, id: string) {
  if (!postgresConfigured()) throw new Error("PostgreSQL is not configured");
  await ensureTenant(tenantId);
  const existing = await providerRow(tenantId, id);
  if (!existing) throw new Error("AI-провайдер не найден.");
  if (existing.status !== "connected") {
    throw new Error("Сначала проверьте соединение с AI-провайдером.");
  }
  await withServerTransaction(async (database) => {
    await database.query(
      `UPDATE prosmet_provider_connections SET selected = FALSE, updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId]
    );
    await database.query(
      `UPDATE prosmet_provider_connections SET selected = TRUE, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
  });
  await writeAuditEvent({
    tenantId,
    action: "provider.selected",
    entityType: "provider_connection",
    entityId: id,
    details: { kind: existing.kind, model: existing.model }
  });
  const selected = await providerRow(tenantId, id);
  if (!selected) throw new Error("AI-провайдер не найден после выбора.");
  return publicConnection(selected);
}

export async function deleteProviderConnection(tenantId: string, id: string) {
  if (!postgresConfigured()) throw new Error("PostgreSQL is not configured");
  await ensureTenant(tenantId);
  const result = await (await getServerDatabase()).query(
    `DELETE FROM prosmet_provider_connections
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  if (!result.rowCount) throw new Error("AI-провайдер не найден.");
  await writeAuditEvent({
    tenantId,
    action: "provider.disconnected",
    entityType: "provider_connection",
    entityId: id
  });
  return { deleted: true };
}

export function providerErrorCode(error: unknown) {
  return error instanceof ProviderConfigurationError
    ? error.code
    : "provider_operation_failed";
}

function defaultRulesRuntime(): ProviderRuntimeConnection {
  return {
    id: "provider:rules:default",
    kind: "rules",
    name: "Встроенный сметный сервис",
    baseUrl: "",
    model: "prosmet-chief-estimator-v2",
    status: "connected",
    selected: true,
    hasSecret: false,
    lastError: null,
    lastCheckedAt: null,
    updatedAt: new Date().toISOString(),
    apiKey: ""
  };
}

export async function getSelectedProviderRuntime(
  tenantId: string
): Promise<ProviderRuntimeConnection> {
  if (!postgresConfigured()) return defaultRulesRuntime();
  await ensureTenant(tenantId);
  const result = await (await getServerDatabase()).query<ProviderRow>(
    `SELECT id, kind, name, base_url, model, status, selected,
            secret_ciphertext, secret_iv, secret_tag, last_error,
            last_checked_at, updated_at
       FROM prosmet_provider_connections
      WHERE tenant_id = $1 AND selected = TRUE
      ORDER BY updated_at DESC
      LIMIT 1`,
    [tenantId]
  );
  const row = result.rows[0];
  if (!row) return defaultRulesRuntime();
  if (row.status !== "connected") {
    throw new ProviderConfigurationError(
      "selected_provider_unavailable",
      row.last_error || "Выбранный AI-провайдер не прошёл проверку соединения."
    );
  }
  return {
    ...publicConnection(row),
    apiKey: decryptSecret(row)
  };
}
