import type { Estimate, EstimateListResponse } from "@prosmet/contracts";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function listStoredEstimates() {
  return requestJson<EstimateListResponse>("/api/estimates");
}

export function fetchStoredEstimate(id: string) {
  return requestJson<Estimate>(`/api/estimates/${encodeURIComponent(id)}`);
}

export function persistEstimate(estimate: Estimate) {
  return requestJson<Estimate>(`/api/estimates/${encodeURIComponent(estimate.id)}`, {
    method: "PUT",
    body: JSON.stringify({ estimate })
  });
}
