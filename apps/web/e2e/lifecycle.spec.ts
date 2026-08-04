import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = "e2e-admin";

async function readJson(response: APIResponse) {
  return response.json().catch(async () => ({ raw: await response.text() }));
}

async function configureFixtureAgent(request: APIRequestContext) {
  const registryResponse = await request.get("/api/agents");
  const registry = await readJson(registryResponse) as { agents?: Array<{ id: string; name: string; active?: boolean }> };
  expect(registryResponse.ok(), JSON.stringify(registry)).toBeTruthy();
  let agent = registry.agents?.find((entry) => entry.name === "Fixture HTTP Agent");

  if (!agent) {
    const createResponse = await request.post("/api/agents", {
      headers: { "x-prosmet-admin-token": adminToken },
      data: {
        name: "Fixture HTTP Agent",
        type: "http-agent",
        enabled: true,
        baseUrl: "http://127.0.0.1:4174/run",
        timeoutMs: 30000
      }
    });
    const created = await readJson(createResponse) as { id: string; name: string; active?: boolean };
    expect(createResponse.ok(), JSON.stringify(created)).toBeTruthy();
    agent = created;
  }

  if (!agent.active) {
    const activateResponse = await request.post(`/api/agents/${encodeURIComponent(agent.id)}/activate`, {
      headers: { "x-prosmet-admin-token": adminToken }
    });
    expect(activateResponse.ok(), await activateResponse.text()).toBeTruthy();
  }
}

async function workflowAction(request: APIRequestContext, estimateId: string, action: string) {
  const response = await request.post(`/api/workflows/estimates/${encodeURIComponent(estimateId)}/actions`, {
    data: { action }
  });
  const body = await readJson(response);
  expect(response.ok(), `${action}: ${JSON.stringify(body)}`).toBeTruthy();
  return body as any;
}

test("construction lifecycle persists intent, revisions, documents, execution and regional prices", async ({ request }, testInfo) => {
  test.skip(external || testInfo.project.name !== "desktop-chromium", "Local API lifecycle contract runs once per suite");
  await configureFixtureAgent(request);

  const beforeResponse = await request.get("/api/estimates");
  const before = await readJson(beforeResponse) as { estimates: unknown[] };
  expect(beforeResponse.ok(), JSON.stringify(before)).toBeTruthy();

  const greetingResponse = await request.post("/api/agent", {
    data: { requestId: `greeting-${Date.now()}`, messages: [{ role: "user", content: "Привет" }] }
  });
  const greeting = await readJson(greetingResponse) as { artifact?: unknown; intent?: string };
  expect(greetingResponse.ok(), JSON.stringify(greeting)).toBeTruthy();
  expect(greeting.intent).toBe("greeting");
  expect(greeting.artifact).toBeNull();

  const documentIntentResponse = await request.post("/api/agent", {
    data: { requestId: `document-${Date.now()}`, messages: [{ role: "user", content: "Подготовь коммерческое предложение" }] }
  });
  const documentIntent = await readJson(documentIntentResponse) as { artifact?: unknown; intent?: string };
  expect(documentIntentResponse.ok(), JSON.stringify(documentIntent)).toBeTruthy();
  expect(documentIntent.intent).toBe("documents");
  expect(documentIntent.artifact).toBeNull();

  const afterDialogueResponse = await request.get("/api/estimates");
  const afterDialogue = await readJson(afterDialogueResponse) as { estimates: unknown[] };
  expect(afterDialogue.estimates).toHaveLength(before.estimates.length);

  const estimateResponse = await request.post("/api/agent", {
    data: {
      requestId: `lifecycle-${Date.now()}`,
      messages: [{
        role: "user",
        content: "Составь смету на ремонт ванной комнаты под ключ в Казани: работы, материалы и сопутствующие расходы."
      }]
    }
  });
  const estimateBody = await readJson(estimateResponse) as {
    artifact?: { type: string; id: string; revision: number; database: string } | null;
    workflow?: { projectId: string; status: string } | null;
    intent?: string;
  };
  expect(estimateResponse.ok(), JSON.stringify(estimateBody)).toBeTruthy();
  expect(estimateBody.intent).toBe("estimate");
  expect(estimateBody.artifact?.type).toBe("estimate");
  expect(estimateBody.artifact?.database).toBe("sqlite");
  expect(estimateBody.workflow?.projectId).toBeTruthy();

  const estimateId = estimateBody.artifact!.id;
  const initialWorkflowResponse = await request.get(`/api/workflows/estimates/${encodeURIComponent(estimateId)}`);
  let workflow = await readJson(initialWorkflowResponse) as any;
  expect(initialWorkflowResponse.ok(), JSON.stringify(workflow)).toBeTruthy();
  expect(workflow.project.activeEstimateId).toBe(estimateId);
  expect(workflow.progress.length).toBeGreaterThan(0);
  expect(workflow.revisions.some((revision: { event: string }) => revision.event === "generated")).toBeTruthy();

  const invalidStart = await request.post(`/api/workflows/estimates/${encodeURIComponent(estimateId)}/actions`, {
    data: { action: "start-work" }
  });
  expect(invalidStart.status()).toBe(409);

  workflow = await workflowAction(request, estimateId, "save-version");
  expect(workflow.estimate.status).toBe("review");
  workflow = await workflowAction(request, estimateId, "send-client");
  expect(workflow.estimate.status).toBe("sent");
  workflow = await workflowAction(request, estimateId, "approve");
  expect(workflow.estimate.status).toBe("approved");
  workflow = await workflowAction(request, estimateId, "generate-proposal");
  workflow = await workflowAction(request, estimateId, "generate-invoice");
  workflow = await workflowAction(request, estimateId, "generate-contract");
  workflow = await workflowAction(request, estimateId, "sign-contract");
  expect(workflow.project.status).toBe("contracted");
  workflow = await workflowAction(request, estimateId, "start-work");
  expect(workflow.project.status).toBe("in_progress");

  for (const item of workflow.progress as Array<{ itemId: string; plannedQuantity: number }>) {
    const progressResponse = await request.put(
      `/api/workflows/projects/${encodeURIComponent(workflow.project.id)}/progress/${encodeURIComponent(item.itemId)}`,
      { data: { actualQuantity: item.plannedQuantity, status: "done", note: "Принято по факту" } }
    );
    const progressBody = await readJson(progressResponse);
    expect(progressResponse.ok(), JSON.stringify(progressBody)).toBeTruthy();
  }

  workflow = await workflowAction(request, estimateId, "complete-work");
  workflow = await workflowAction(request, estimateId, "generate-act");
  workflow = await workflowAction(request, estimateId, "generate-ks2");
  workflow = await workflowAction(request, estimateId, "generate-ks3");
  workflow = await workflowAction(request, estimateId, "close-project");
  expect(workflow.project.status).toBe("completed");
  expect(workflow.project.progress.percent).toBe(100);

  const documentTypes = new Set((workflow.documents as Array<{ type: string }>).map((document) => document.type));
  for (const type of ["commercial-proposal", "invoice", "contract", "act", "ks-2", "ks-3"]) {
    expect(documentTypes.has(type), `Missing ${type}`).toBeTruthy();
  }
  expect(workflow.revisions.length).toBeGreaterThanOrEqual(4);

  const pricesResponse = await request.get("/api/workflows/prices?limit=300");
  const prices = await readJson(pricesResponse) as { entries: Array<{ sampleCount: number }> };
  expect(pricesResponse.ok(), JSON.stringify(prices)).toBeTruthy();
  expect(prices.entries.length).toBeGreaterThan(0);
  expect(prices.entries.some((entry) => entry.sampleCount >= 1)).toBeTruthy();
});
