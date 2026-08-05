import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = String(process.env.PROSMET_BASE_URL || "").replace(/\/+$/, "");
const adminToken = String(process.env.PROSMET_E2E_ADMIN_TOKEN || "").trim();
const evidenceDirectory = process.env.PROSMET_EVIDENCE_DIR;
const requestedMinimumTimeout = Number(process.env.PROSMET_AGENT_MIN_TIMEOUT_MS || 0);
const configuredAttempts = Number(process.env.PROSMET_AGENT_PREFLIGHT_ATTEMPTS || 6);
const preflightAttempts = Math.min(10, Math.max(1, Math.floor(configuredAttempts || 6)));

if (!baseUrl || !adminToken || !evidenceDirectory) {
  throw new Error("PROSMET_BASE_URL, PROSMET_E2E_ADMIN_TOKEN and PROSMET_EVIDENCE_DIR are required");
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const retryableStatus = (status) => status === 408 || status === 425 || status === 429 || status >= 500;
const errorSummary = (body) => {
  const message = body?.error?.message || body?.message || null;
  return typeof message === "string" ? message.slice(0, 500) : null;
};

const response = await fetch(`${baseUrl}/api/agents`, {
  headers: { "x-prosmet-admin-token": adminToken }
});
const registry = await response.json().catch(() => null);
if (!response.ok) {
  throw new Error(`Unable to read production agent registry: HTTP ${response.status}`);
}

const active = Array.isArray(registry?.agents)
  ? registry.agents.find((agent) => agent?.active === true)
  : null;
if (!active || active.enabled === false) {
  throw new Error("Production registry has no enabled active agent");
}

const profile = {
  generatedAt: new Date().toISOString(),
  origin: baseUrl,
  activeAgent: {
    type: String(active.type || "unknown"),
    model: active.model || null,
    timeoutMs: Number(active.timeoutMs) || null,
    enabled: active.enabled !== false
  }
};

await mkdir(evidenceDirectory, { recursive: true });
const profilePath = join(evidenceDirectory, "agent-profile.json");
const saveProfile = () => writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
await saveProfile();

if (requestedMinimumTimeout > 0 && Number(active.timeoutMs) < requestedMinimumTimeout) {
  const update = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(active.id)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-prosmet-admin-token": adminToken
    },
    body: JSON.stringify({ timeoutMs: requestedMinimumTimeout })
  });
  const updated = await update.json().catch(() => null);
  if (!update.ok) {
    profile.timeoutUpdate = { ok: false, requestedMinimumTimeout };
    await saveProfile();
    throw new Error(`Unable to update active production agent timeout: HTTP ${update.status}`);
  }
  profile.timeoutUpdate = {
    ok: true,
    from: Number(active.timeoutMs) || null,
    to: Number(updated?.timeoutMs) || requestedMinimumTimeout
  };
  profile.activeAgent.timeoutMs = Number(updated?.timeoutMs) || requestedMinimumTimeout;
  await saveProfile();
}

const attempts = [];
let successfulPreflight = null;

for (let attempt = 1; attempt <= preflightAttempts; attempt += 1) {
  const startedAt = Date.now();
  try {
    const preflight = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(active.id)}/test`, {
      method: "POST",
      headers: { "x-prosmet-admin-token": adminToken }
    });
    const body = await preflight.json().catch(() => null);
    const result = {
      attempt,
      ok: preflight.ok,
      status: preflight.status,
      latencyMs: Date.now() - startedAt,
      errorCode: preflight.ok ? null : body?.error?.code || null,
      errorMessage: preflight.ok ? null : errorSummary(body)
    };
    attempts.push(result);

    if (preflight.ok) {
      successfulPreflight = result;
      break;
    }
    if (!retryableStatus(preflight.status)) break;
  } catch (error) {
    attempts.push({
      attempt,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown network error"
    });
  }

  if (attempt < preflightAttempts) {
    const delayMs = Math.min(30_000, 1_500 * 2 ** (attempt - 1));
    await sleep(delayMs);
  }
}

const lastAttempt = attempts.at(-1) || null;
profile.preflight = {
  ok: Boolean(successfulPreflight),
  attempts,
  attemptCount: attempts.length,
  latencyMs: successfulPreflight?.latencyMs ?? lastAttempt?.latencyMs ?? null,
  errorCode: successfulPreflight ? null : lastAttempt?.errorCode || null,
  finalStatus: successfulPreflight?.status ?? lastAttempt?.status ?? null
};
await saveProfile();

if (!successfulPreflight) {
  const detail = [
    lastAttempt?.status ? `HTTP ${lastAttempt.status}` : "network failure",
    lastAttempt?.errorCode,
    lastAttempt?.errorMessage
  ].filter(Boolean).join(" · ");
  throw new Error(`Active production agent preflight failed after ${attempts.length} attempt(s): ${detail}`);
}
