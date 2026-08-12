import { expect, test, type APIRequestContext } from "@playwright/test";

const adminToken = "e2e-admin";

async function json(response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return response.json().catch(async () => ({ raw: await response.text() }));
}

async function configureFixtureAgent(request: APIRequestContext) {
  const registryResponse = await request.get("/api/agents");
  const registry = await json(registryResponse) as { agents?: Array<{ id: string; name: string; active?: boolean }> };
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
    const created = await json(createResponse) as { id: string; name: string; active?: boolean };
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

test("estimate artifact survives edit, revision and reload", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Persistence contract runs once per suite");

  await configureFixtureAgent(request);

  const createResponse = await request.post("/api/agent", {
    data: {
      requestId: `artifact-persistence-${Date.now()}`,
      messages: [{
        role: "user",
        content: "Составь смету на штукатурку стен 100 м2 в Лениногорске."
      }]
    }
  });
  const created = await json(createResponse) as {
    artifact?: { type: string; id: string; revision: number; database: string } | null;
  };
  expect(createResponse.ok(), JSON.stringify(created)).toBeTruthy();
  expect(created.artifact?.type).toBe("estimate");

  const estimateId = created.artifact!.id;
  const firstResponse = await request.get(`/api/workflows/estimates/${encodeURIComponent(estimateId)}`);
  const first = await json(firstResponse) as any;
  expect(firstResponse.ok(), JSON.stringify(first)).toBeTruthy();
  expect(first.estimate.id).toBe(estimateId);
  expect(first.estimate.revision).toBe(created.artifact!.revision);
  expect(first.revisions.length).toBeGreaterThanOrEqual(1);

  const firstItem = first.estimate.sections?.[0]?.items?.[0];
  expect(firstItem?.id).toBeTruthy();
  expect(Number(firstItem.quantity)).toBeGreaterThan(0);

  const originalQuantity = Number(firstItem.quantity);
  const updatedQuantity = originalQuantity + 1;

  const updateResponse = await request.put(
    `/api/workflows/estimates/${encodeURIComponent(estimateId)}/items/${encodeURIComponent(firstItem.id)}`,
    { data: { quantity: updatedQuantity } }
  );
  const updated = await json(updateResponse);
  expect(updateResponse.ok(), JSON.stringify(updated)).toBeTruthy();

  const reloadedResponse = await request.get(`/api/workflows/estimates/${encodeURIComponent(estimateId)}`);
  const reloaded = await json(reloadedResponse) as any;
  expect(reloadedResponse.ok(), JSON.stringify(reloaded)).toBeTruthy();

  const persistedItem = reloaded.estimate.sections?.flatMap((section: any) => section.items ?? [])
    .find((item: any) => item.id === firstItem.id);
  expect(Number(persistedItem?.quantity)).toBe(updatedQuantity);
  expect(reloaded.estimate.revision).toBeGreaterThanOrEqual(first.estimate.revision);
  expect(reloaded.revisions.some((revision: any) => Number(revision.snapshot?.sections?.[0]?.items?.[0]?.quantity) === updatedQuantity)).toBeTruthy();
});
