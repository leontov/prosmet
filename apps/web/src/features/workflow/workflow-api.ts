import type {
  ConstructionDocument,
  ConstructionProject,
  Estimate,
  PriceCatalogEntry,
  WorkflowAction,
  WorkflowDetail,
  WorkProgressItem,
  WorkProgressStatus
} from "@prosmet/contracts";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = await response.json().catch(() => null) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? body.error?.message
      : null;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return body as T;
}

export async function listEstimates(): Promise<Estimate[]> {
  const result = await api<{ estimates: Estimate[] }>("/api/estimates");
  return result.estimates;
}

export async function saveEstimate(estimate: Estimate): Promise<Estimate> {
  return api<Estimate>(`/api/estimates/${encodeURIComponent(estimate.id)}`, {
    method: "PUT",
    body: JSON.stringify({ estimate })
  });
}

export async function listProjects(): Promise<ConstructionProject[]> {
  const result = await api<{ projects: ConstructionProject[] }>("/api/workflows/projects");
  return result.projects;
}

export async function fetchWorkflowByEstimate(estimateId: string): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/api/workflows/estimates/${encodeURIComponent(estimateId)}`);
}

export async function fetchWorkflowByProject(projectId: string): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/api/workflows/projects/${encodeURIComponent(projectId)}`);
}

export async function runWorkflowAction(estimateId: string, action: WorkflowAction): Promise<WorkflowDetail> {
  return api<WorkflowDetail>(`/api/workflows/estimates/${encodeURIComponent(estimateId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

export async function updateProgress(
  projectId: string,
  itemId: string,
  patch: { actualQuantity: number; status: WorkProgressStatus; note?: string }
): Promise<{ progress: WorkProgressItem; workflow: WorkflowDetail }> {
  return api<{ progress: WorkProgressItem; workflow: WorkflowDetail }>(
    `/api/workflows/projects/${encodeURIComponent(projectId)}/progress/${encodeURIComponent(itemId)}`,
    { method: "PUT", body: JSON.stringify(patch) }
  );
}

export async function listDocuments(projectId?: string): Promise<ConstructionDocument[]> {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const result = await api<{ documents: ConstructionDocument[] }>(`/api/workflows/documents${suffix}`);
  return result.documents;
}

export async function updateDocumentStatus(
  documentId: string,
  action: "send" | "sign" | "approve"
): Promise<ConstructionDocument> {
  return api<ConstructionDocument>(`/api/workflows/documents/${encodeURIComponent(documentId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

export async function updateDocumentContent(
  documentId: string,
  content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
): Promise<ConstructionDocument> {
  return api<ConstructionDocument>(`/api/workflows/documents/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: JSON.stringify({ content })
  });
}

export async function listPrices(query = "", region = ""): Promise<PriceCatalogEntry[]> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (region) params.set("region", region);
  params.set("limit", "300");
  const result = await api<{ entries: PriceCatalogEntry[] }>(`/api/workflows/prices?${params}`);
  return result.entries;
}
