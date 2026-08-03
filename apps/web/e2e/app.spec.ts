import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const external = Boolean(process.env.PROSMET_BASE_URL);
const verifyCriticalPath = process.env.PROSMET_CRITICAL_PATH !== "false";
const adminToken = "e2e-admin";
const productionAdminToken = process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null;
const productionPrompt = [
  "Production E2E verification.",
  "Подготовь готовую редактируемую смету на механизированную штукатурку:",
  "358 м², слой 15 мм, Казань, Республика Татарстан.",
  "Не задавай уточняющих вопросов. Верни JSON с artifact estimate и полной сметой."
].join(" ");

type CriticalPathEvidence = {
  schemaVersion: 1;
  scope: "local" | "production";
  project: string;
  origin: string;
  releaseSha: string;
  generatedAt: string;
  checks: {
      health: boolean;
      browserShell: boolean;
      activeAgentResponse: boolean;
      artifactReference: boolean;
      sqliteArtifact: boolean;
    persistedRead: boolean;
    persistedEdit: boolean;
    reloadRestored: boolean;
  };
  artifact?: {
    id: string;
    database: string;
    agentId: string | null;
    revisionBeforeEdit: number;
    revisionAfterEdit: number;
  };
};

async function writeCriticalPathEvidence(
  testInfo: TestInfo,
  evidence: CriticalPathEvidence
) {
  const configuredDirectory = process.env.PROSMET_EVIDENCE_DIR;
  const path = configuredDirectory
    ? join(configuredDirectory, `production-critical-path-${testInfo.project.name}.json`)
    : testInfo.outputPath("production-critical-path.json");
  if (configuredDirectory) await mkdir(configuredDirectory, { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await testInfo.attach("production-critical-path", { path, contentType: "application/json" });
}

function requireEstimateArtifact(body: unknown) {
  const result = body as {
    artifact?: { type?: unknown; id?: unknown; revision?: unknown; database?: unknown } | null;
    agent?: { id?: unknown } | null;
  };
  const artifact = result.artifact;
  if (
    !artifact || artifact.type !== "estimate" || typeof artifact.id !== "string" || !artifact.id ||
    typeof artifact.revision !== "number" || typeof artifact.database !== "string" ||
    typeof result.agent?.id !== "string" || !result.agent.id
  ) {
    throw new Error(`Agent did not return a persisted estimate artifact: ${JSON.stringify(body)}`);
  }
  return {
    id: artifact.id,
    revision: artifact.revision,
    database: artifact.database,
    agentId: result.agent.id
  };
}

async function configureFixtureAgent(page: Page) {
  const registryResponse = await page.request.get("/api/agents");
  expect(registryResponse.ok()).toBeTruthy();
  const registry = await registryResponse.json();
  let agent = registry.agents.find((entry: { name: string }) => entry.name === "Fixture HTTP Agent");

  if (!agent) {
    const createResponse = await page.request.post("/api/agents", {
      headers: { "x-prosmet-admin-token": adminToken },
      data: {
        name: "Fixture HTTP Agent",
        type: "http-agent",
        enabled: true,
        baseUrl: "http://127.0.0.1:4174/run",
        timeoutMs: 30000
      }
    });
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    agent = await createResponse.json();
  }

  if (!agent.active) {
    const activateResponse = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/activate`, {
      headers: { "x-prosmet-admin-token": adminToken }
    });
    expect(activateResponse.ok(), await activateResponse.text()).toBeTruthy();
  }

  const testResponse = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/test`, {
    headers: { "x-prosmet-admin-token": adminToken }
  });
  expect(testResponse.ok(), await testResponse.text()).toBeTruthy();
  const testResult = await testResponse.json();
  expect(testResult.message).toContain("OK");

  const loginResponse = await page.request.post("/api/admin/session", { data: { token: adminToken } });
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
}

async function configureProductionAdminSession(page: Page) {
  if (!productionAdminToken) {
    throw new Error("PROSMET_E2E_ADMIN_TOKEN is required for the authenticated production critical-path test");
  }
  const loginResponse = await page.request.post("/api/admin/session", {
    data: { token: productionAdminToken }
  });
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
}

async function openMobileMenu(page: Page) {
  await page.getByRole("button", { name: "Открыть навигацию" }).click();
  const dialog = page.getByRole("dialog", { name: "Навигация" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("greenfield shell uses real agent integration and the mobile reference layout", async ({ page }, testInfo) => {
  if (external && verifyCriticalPath) testInfo.setTimeout(180_000);
  const violations: string[] = [];
  const evidence: CriticalPathEvidence = {
    schemaVersion: 1,
    scope: external ? "production" : "local",
    project: testInfo.project.name,
    origin: "",
    releaseSha: "",
    generatedAt: new Date().toISOString(),
    checks: {
      health: false,
      browserShell: false,
      activeAgentResponse: false,
      artifactReference: false,
      sqliteArtifact: false,
      persistedRead: false,
      persistedEdit: false,
      reloadRestored: false
    }
  };
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => violations.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => violations.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`));

  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP:${event.violatedDirective}:${event.blockedURI}`);
    });
    if (!sessionStorage.getItem("prosmet-e2e-reset")) {
      localStorage.removeItem("prosmet-greenfield-estimate");
      localStorage.removeItem("prosmet-workspace-v1");
      sessionStorage.setItem("prosmet-e2e-reset", "1");
    }
  });

  if (!external) {
    await configureFixtureAgent(page);
  } else if (verifyCriticalPath) {
    await configureProductionAdminSession(page);
  }

  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.ok(), await healthResponse.text()).toBeTruthy();
  const health = await healthResponse.json() as { releaseSha?: unknown; ui?: unknown };
  expect(health.ui).toBe("greenfield");
  expect(typeof health.releaseSha).toBe("string");
  if (process.env.PROSMET_RELEASE_SHA) expect(health.releaseSha).toBe(process.env.PROSMET_RELEASE_SHA);
  evidence.releaseSha = String(health.releaseSha);
  evidence.checks.health = true;

  await page.goto("/", { waitUntil: "networkidle" });
  evidence.origin = new URL(page.url()).origin;
  await expect(page.getByText("Founder", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Владислав Кочуров", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Дом в Альметьевске", { exact: true })).toHaveCount(0);

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByText("Просметчик", { exact: true })).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Что нужно рассчитать?" })).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    if (!external) {
      await expect(page.getByText("Fixture HTTP Agent", { exact: true }).first()).toBeVisible();
      await expect(page.locator(".agent-connection.active")).toHaveCount(1);
    }
    await page.getByRole("button", { name: "Чаты", exact: true }).click();
  } else {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    await expect(page.getByRole("button", { name: "Выбрать раздел" })).toContainText("Чат");
    await expect(page.getByRole("button", { name: "Открыть навигацию" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Голосовой режим" })).toBeVisible();
    await expect(page.getByText("Составить смету", { exact: true })).toBeVisible();
    await expect(page.getByText("Рассчитать по замерам", { exact: true })).toBeVisible();
    await expect(page.getByText("Подготовить документы", { exact: true })).toBeVisible();
    await expect(page.locator(".mobile-reference-composer")).toBeVisible();
    await expect(page.locator("#mobile-message")).toHaveAttribute("placeholder", "Опишите объект и замеры...");
    await expect(page.locator(".mobile-bottom-nav")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Новый расчёт" })).toHaveCount(0);

    let menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /Настройки/ }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    if (!external) await expect(page.getByText("Fixture HTTP Agent", { exact: true }).first()).toBeVisible();

    menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /^Чат/ }).click();
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
  }
  evidence.checks.browserShell = true;

  await page.screenshot({ path: `artifacts-shell-${testInfo.project.name}.png`, fullPage: true });

  if (!verifyCriticalPath) {
    expect(violations).toEqual([]);
    return;
  }

  const agentResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/agent" && response.request().method() === "POST",
    { timeout: 150_000 }
  );
  const composer = page.locator(testInfo.project.name === "desktop-chromium" ? "#desktop-message" : "#mobile-message");
  await composer.fill(productionPrompt);
  await page.getByRole("button", { name: "Отправить" }).click();
  const agentResponse = await agentResponsePromise;
  const agentBody = await agentResponse.json().catch(() => null);
  expect(agentResponse.ok(), JSON.stringify(agentBody)).toBeTruthy();
  const artifact = requireEstimateArtifact(agentBody);
  expect(artifact.database).toBe("sqlite");
  evidence.checks.activeAgentResponse = true;
  evidence.checks.artifactReference = true;
  evidence.checks.sqliteArtifact = true;

  const editor = page.getByRole("dialog", { name: "Редактор сметы" });
  await expect(editor).toBeVisible({ timeout: 30_000 });

  const storedResponse = await page.request.get(`/api/estimates/${encodeURIComponent(artifact.id)}`);
  expect(storedResponse.ok(), await storedResponse.text()).toBeTruthy();
  const stored = await storedResponse.json();
  expect(stored.id).toBe(artifact.id);
  expect(stored.revision).toBe(artifact.revision);
  const firstItem = stored.sections.flatMap((section: { id: string; items: Array<{ id: string; quantity: number }> }) =>
    section.items.map((item) => ({ ...item, sectionId: section.id }))
  )[0];
  if (!firstItem) throw new Error("Persisted estimate contains no editable items");
  evidence.checks.persistedRead = true;
  const changedQuantity = Number(firstItem.quantity) + 1;

  if (testInfo.project.name === "desktop-chromium") {
    await expect(editor.locator("#estimate-title")).toHaveValue(stored.title);
    const desktopEditor = page.getByTestId("desktop-estimate-editor");
    await expect(desktopEditor).toBeVisible();
    await expect(editor.locator(".estimate-summary")).toBeVisible();
    expect((await desktopEditor.boundingBox())?.width ?? 0).toBeGreaterThan(1200);
    const editResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
      response.request().method() === "PUT"
    );
    await editor.locator(`#quantity-${firstItem.id}`).fill(String(changedQuantity));
    const editResponse = await editResponsePromise;
    expect(editResponse.ok(), await editResponse.text()).toBeTruthy();
  } else {
    await expect(editor.getByRole("heading", { name: stored.title })).toBeVisible();
    const mobileEditor = page.getByTestId("mobile-estimate-editor");
    await expect(mobileEditor).toBeVisible();
    const card = editor.locator(".mobile-estimate-item").first();
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(112);
    const titleField = card.locator("textarea").first();
    const titleGeometry = await titleField.evaluate((element) => ({
      fontSize: parseFloat(getComputedStyle(element).fontSize),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    expect(titleGeometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(titleGeometry.scrollWidth).toBeLessThanOrEqual(titleGeometry.clientWidth + 1);
    expect(titleGeometry.scrollHeight).toBeLessThanOrEqual(titleGeometry.clientHeight + 1);
    const actionbar = editor.locator(".mobile-estimate-actions");
    expect((await actionbar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(72);
    const editResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
      response.request().method() === "PUT"
    );
    await editor.locator(`#mobile-quantity-${firstItem.id}`).fill(String(changedQuantity));
    const editResponse = await editResponsePromise;
    expect(editResponse.ok(), await editResponse.text()).toBeTruthy();
  }

  const saveResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
    response.request().method() === "PUT"
  );
  await editor.getByRole("button", { name: "Сохранить версию", exact: true }).first().click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
  const saved = await saveResponse.json();
  expect(saved.revision).toBe(artifact.revision + 1);
  const updatedResponse = await page.request.get(`/api/estimates/${encodeURIComponent(artifact.id)}`);
  expect(updatedResponse.ok(), await updatedResponse.text()).toBeTruthy();
  const updated = await updatedResponse.json();
  expect(updated.revision).toBe(saved.revision);
  expect(updated.sections.flatMap((section: { items: Array<{ id: string; quantity: number }> }) => section.items)
    .find((item: { id: string }) => item.id === firstItem.id)?.quantity).toBe(changedQuantity);
  evidence.checks.persistedEdit = true;

  await page.screenshot({ path: `artifacts-estimate-${testInfo.project.name}.png`, fullPage: true });
  await page.evaluate(() => localStorage.removeItem("prosmet-workspace-v1"));
  await page.reload({ waitUntil: "networkidle" });

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.locator(".history-item").filter({ hasText: stored.title })).toBeVisible();
  } else {
    const menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /Сметы/ }).click();
    await expect(page.getByText(stored.title, { exact: true })).toBeVisible();
  }
  evidence.checks.reloadRestored = true;
  evidence.artifact = {
    id: artifact.id,
    database: artifact.database,
    agentId: artifact.agentId,
    revisionBeforeEdit: artifact.revision,
    revisionAfterEdit: saved.revision
  };
  await writeCriticalPathEvidence(testInfo, evidence);

  expect(violations).toEqual([]);
});
