import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = String(process.env.PROSMET_BASE_URL || "").replace(/\/+$/, "");
const adminToken = String(process.env.PROSMET_E2E_ADMIN_TOKEN || "").trim();
const evidenceDirectory = process.env.PROSMET_EVIDENCE_DIR;

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
await writeFile(join(evidenceDirectory, "agent-profile.json"), `${JSON.stringify(profile, null, 2)}\n`);
