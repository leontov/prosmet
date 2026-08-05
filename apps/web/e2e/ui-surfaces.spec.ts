import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

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
    agent = await readJson(createResponse) as { id: string; name: string; active?: boolean };
    expect(createResponse.ok(), JSON.stringify(agent)).toBeTruthy();
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

async function seedProfessionalData(request: APIRequestContext) {
  const estimateResponse = await request.post("/api/agent", {
    data: {
      requestId: `ui-surfaces-${Date.now()}`,
      messages: [{ role: "user", content: "Составь смету на ремонт ванной комнаты под ключ в Казани: работы и материалы." }]
    }
  });
  const estimate = await readJson(estimateResponse) as { artifact?: { id?: string } | null };
  expect(estimateResponse.ok(), JSON.stringify(estimate)).toBeTruthy();
  const estimateId = estimate.artifact?.id;
  expect(estimateId).toBeTruthy();

  for (const action of [
    "save-version",
    "send-client",
    "approve",
    "generate-proposal",
    "generate-invoice",
    "generate-contract"
  ]) {
    const response = await request.post(`/api/workflows/estimates/${encodeURIComponent(estimateId!)}/actions`, {
      data: { action }
    });
    expect(response.ok(), `${action}: ${await response.text()}`).toBeTruthy();
  }
}

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function openMobileDrawer(page: Page) {
  await page.getByRole("button", { name: "Открыть навигацию" }).click();
  const drawer = page.getByRole("dialog", { name: "Навигация" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("projects, estimates, documents, prices and workflow are polished across desktop and mobile", async ({ page }, testInfo) => {
  test.skip(external, "The visual surface audit uses deterministic local fixture data");
  await configureFixtureAgent(page.request);
  await seedProfessionalData(page.request);

  const violations: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") violations.push(`console:${message.text()}`); });
  page.on("pageerror", (error) => violations.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => violations.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`));

  await page.goto("/", { waitUntil: "networkidle" });

  if (testInfo.project.name === "desktop-chromium") {
    await page.getByRole("button", { name: "Проекты", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-projects-desktop-chromium.png", fullPage: true });

    await page.getByRole("button", { name: "Сметы", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Сметы" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-estimates-desktop-chromium.png", fullPage: true });

    await page.getByRole("button", { name: "Документы", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Документы" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-documents-desktop-chromium.png", fullPage: true });

    await page.getByRole("button", { name: "Справочник цен", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Справочник цен" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-prices-desktop-chromium.png", fullPage: true });

    await page.getByRole("button", { name: "Проекты", exact: true }).click();
    await page.locator(".pro-project-row").first().click();
    await expect(page.getByRole("dialog", { name: "Процесс проекта" })).toBeVisible();
    await page.screenshot({ path: "artifacts-workflow-desktop-chromium.png", fullPage: true });
  } else {
    let drawer = await openMobileDrawer(page);
    await page.screenshot({ path: "artifacts-drawer-mobile-chromium.png", fullPage: true });
    await drawer.getByRole("button", { name: /Проекты/ }).click();
    await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-projects-mobile-chromium.png", fullPage: true });

    drawer = await openMobileDrawer(page);
    await drawer.getByRole("button", { name: /Сметы/ }).click();
    await expect(page.getByRole("heading", { name: "Сметы" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-estimates-mobile-chromium.png", fullPage: true });

    drawer = await openMobileDrawer(page);
    await drawer.getByRole("button", { name: /Документы/ }).click();
    await expect(page.getByRole("heading", { name: "Документы" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-documents-mobile-chromium.png", fullPage: true });

    drawer = await openMobileDrawer(page);
    await drawer.getByRole("button", { name: /^Цены/ }).click();
    await expect(page.getByRole("heading", { name: "Справочник цен" })).toBeVisible();
    await assertNoPageOverflow(page);
    await page.screenshot({ path: "artifacts-prices-mobile-chromium.png", fullPage: true });

    drawer = await openMobileDrawer(page);
    await drawer.getByRole("button", { name: /Проекты/ }).click();
    await page.locator(".pro-project-row").first().click();
    await expect(page.getByRole("dialog", { name: "Процесс проекта" })).toBeVisible();
    await page.screenshot({ path: "artifacts-workflow-mobile-chromium.png", fullPage: true });
  }

  expect(violations).toEqual([]);
});
