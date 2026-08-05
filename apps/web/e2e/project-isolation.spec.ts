import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = "e2e-admin";
const prompt = "Составь смету на механизированную штукатурку 358 м² в Казани: работы и материалы.";

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

  const loginResponse = await request.post("/api/admin/session", { data: { token: adminToken } });
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
}

async function createEstimate(request: APIRequestContext, suffix: string) {
  const response = await request.post("/api/agent", {
    data: {
      requestId: `project-isolation-${suffix}-${Date.now()}`,
      messages: [{ role: "user", content: prompt }]
    }
  });
  const body = await readJson(response) as {
    artifact?: { id?: string; type?: string } | null;
    workflow?: { projectId?: string; status?: string } | null;
  };
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.artifact?.type).toBe("estimate");
  expect(body.artifact?.id).toBeTruthy();
  expect(body.workflow?.projectId).toBeTruthy();
  return {
    estimateId: body.artifact!.id!,
    projectId: body.workflow!.projectId!,
    status: body.workflow!.status
  };
}

test("a new estimate never inherits lifecycle status or progress from a same-name project", async ({ request }, testInfo) => {
  test.skip(external || testInfo.project.name !== "desktop-chromium", "Local project identity contract runs once per suite");
  await configureFixtureAgent(request);

  const first = await createEstimate(request, "first");
  const second = await createEstimate(request, "second");

  expect(second.estimateId).not.toBe(first.estimateId);
  expect(second.projectId).not.toBe(first.projectId);
  expect(first.status).toBe("estimate_draft");
  expect(second.status).toBe("estimate_draft");

  const firstResponse = await request.get(`/api/workflows/projects/${encodeURIComponent(first.projectId)}`);
  const secondResponse = await request.get(`/api/workflows/projects/${encodeURIComponent(second.projectId)}`);
  const firstWorkflow = await readJson(firstResponse) as any;
  const secondWorkflow = await readJson(secondResponse) as any;

  expect(firstResponse.ok(), JSON.stringify(firstWorkflow)).toBeTruthy();
  expect(secondResponse.ok(), JSON.stringify(secondWorkflow)).toBeTruthy();
  expect(firstWorkflow.project.activeEstimateId).toBe(first.estimateId);
  expect(secondWorkflow.project.activeEstimateId).toBe(second.estimateId);
  expect(firstWorkflow.project.status).toBe("estimate_draft");
  expect(secondWorkflow.project.status).toBe("estimate_draft");
  expect(firstWorkflow.project.progress.percent).toBe(0);
  expect(secondWorkflow.project.progress.percent).toBe(0);
  expect(firstWorkflow.progress.every((item: { actualQuantity: number; status: string }) => item.actualQuantity === 0 && item.status === "planned")).toBeTruthy();
  expect(secondWorkflow.progress.every((item: { actualQuantity: number; status: string }) => item.actualQuantity === 0 && item.status === "planned")).toBeTruthy();
});
