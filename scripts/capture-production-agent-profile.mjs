import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = String(process.env.PROSMET_BASE_URL || "").replace(/\/+$/, "");
const adminToken = String(process.env.PROSMET_E2E_ADMIN_TOKEN || "").trim();
const evidenceDirectory = process.env.PROSMET_EVIDENCE_DIR;
const requestedMinimumTimeout = Number(process.env.PROSMET_AGENT_MIN_TIMEOUT_MS || 0);

if (!baseUrl || !adminToken || !evidenceDirectory) {
  throw new Error("PROSMET_BASE_URL, PROSMET_E2E_ADMIN_TOKEN and PROSMET_EVIDENCE_DIR are required");
}

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

const preflightStartedAt = Date.now();
const preflight = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(active.id)}/test`, {
  method: "POST",
  headers: { "x-prosmet-admin-token": adminToken }
});
const preflightBody = await preflight.json().catch(() => null);
profile.preflight = {
  ok: preflight.ok,
  latencyMs: Date.now() - preflightStartedAt,
  errorCode: preflight.ok ? null : preflightBody?.error?.code || null
};
await saveProfile();
if (!preflight.ok) {
  throw new Error(`Active production agent preflight failed: HTTP ${preflight.status}`);
}
