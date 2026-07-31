import type {
  AccountProfile,
  AdminSessionStatus,
  AgentConfigInput,
  AgentDescriptor,
  AgentRegistryResponse,
  AgentTestResult,
  ApiErrorBody,
  SystemStatus
} from "@prosmet/contracts";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as Partial<ApiErrorBody>;
    throw new Error(apiError?.error?.message || `HTTP ${response.status}`);
  }
  return body as T;
}

export function fetchAgentRegistry() {
  return requestJson<AgentRegistryResponse>("/api/agents");
}

export function fetchSystemStatus() {
  return requestJson<SystemStatus>("/api/system");
}

export function fetchAdminSession() {
  return requestJson<AdminSessionStatus>("/api/admin/session");
}

export function loginAdmin(token: string) {
  return requestJson<AdminSessionStatus>("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function logoutAdmin() {
  return requestJson<AdminSessionStatus>("/api/admin/session", { method: "DELETE" });
}

export function createAgent(input: AgentConfigInput) {
  return requestJson<AgentDescriptor>("/api/agents", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAgent(id: string, input: AgentConfigInput) {
  return requestJson<AgentDescriptor>(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteAgent(id: string) {
  return requestJson<{ deleted: true }>(`/api/agents/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function activateAgent(id: string) {
  return requestJson<AgentDescriptor>(`/api/agents/${encodeURIComponent(id)}/activate`, {
    method: "POST"
  });
}

export function testAgent(id: string) {
  return requestJson<AgentTestResult>(`/api/agents/${encodeURIComponent(id)}/test`, {
    method: "POST"
  });
}

export function fetchAccountProfile() {
  return requestJson<AccountProfile>("/api/account");
}

export function saveAccountProfile(profile: Pick<AccountProfile, "name" | "email" | "organization" | "region">) {
  return requestJson<AccountProfile>("/api/account", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function announceAgentChange() {
  window.dispatchEvent(new CustomEvent("prosmet:agents-changed"));
}
