import type {
  AdminAgentSummary,
  AgentCatalog,
  AgentConfigurationInput,
  AgentSummary
} from "@prosmet/contracts";

export const selectedAgentStorageKey = "prosmet-selected-agent";
export const agentSelectionEvent = "prosmet-agent-selection";

type ApiErrorBody = { error?: { code?: string; message?: string } };

async function api<T>(path: string, init: RequestInit = {}, adminToken = ""): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (adminToken) headers.set("authorization", `Bearer ${adminToken}`);
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json() as ApiErrorBody;
      message = body.error?.message || message;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function loadAgentCatalog() {
  return api<AgentCatalog>("/api/agents");
}

export function loadAdminAgents(adminToken: string) {
  return api<{ defaultAgentId: string; agents: AdminAgentSummary[]; configPath: string }>("/api/admin/agents", {}, adminToken);
}

export function saveAgentConfiguration(input: AgentConfigurationInput, adminToken: string) {
  const path = input.id ? `/api/admin/agents/${encodeURIComponent(input.id)}` : "/api/admin/agents";
  return api<{ agent: AdminAgentSummary; defaultAgentId: string }>(
    path,
    { method: input.id ? "PUT" : "POST", body: JSON.stringify(input) },
    adminToken
  );
}

export function deleteAgentConfiguration(id: string, adminToken: string) {
  return api<{ defaultAgentId: string }>(
    `/api/admin/agents/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    adminToken
  );
}

export function activateAgentConfiguration(id: string, adminToken: string) {
  return api<{ defaultAgentId: string }>(
    `/api/admin/agents/${encodeURIComponent(id)}/activate`,
    { method: "POST" },
    adminToken
  );
}

export function testAgentConfiguration(id: string, adminToken: string) {
  return api<{ ok: boolean; text: string; provider: AgentSummary; latencyMs: number }>(
    `/api/admin/agents/${encodeURIComponent(id)}/test`,
    { method: "POST" },
    adminToken
  );
}

export function readSelectedAgentId() {
  try { return window.localStorage.getItem(selectedAgentStorageKey) || ""; } catch { return ""; }
}

export function selectAgent(id: string) {
  try {
    if (id) window.localStorage.setItem(selectedAgentStorageKey, id);
    else window.localStorage.removeItem(selectedAgentStorageKey);
  } catch {}
  window.dispatchEvent(new CustomEvent(agentSelectionEvent, { detail: id }));
}
