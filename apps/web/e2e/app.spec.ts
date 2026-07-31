import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = "e2e-admin";

async function configureFixtureAgent(page: Parameters<typeof test>[0] extends never ? never : any) {
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

async function openMobileMenu(page: any) {
  await page.getByRole("button", { name: "Открыть навигацию" }).click();
  const dialog = page.getByRole("dialog", { name: "Навигация" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("greenfield shell uses real agent integration without demo fallbacks", async ({ page }, testInfo) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => violations.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => violations.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`));

  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP:${event.violatedDirective}:${event.blockedURI}`);
    });
    localStorage.removeItem("prosmet-greenfield-estimate");
    localStorage.removeItem("prosmet-workspace-v1");
  });

  if (!external) await configureFixtureAgent(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Просметчик", { exact: true })).toBeVisible();
  await expect(page.getByText("Founder", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Владислав Кочуров", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Дом в Альметьевске", { exact: true })).toHaveCount(0);

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByTestId("desktop-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Что нужно сделать?" })).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    if (!external) {
      await expect(page.getByText("Fixture HTTP Agent", { exact: true })).toBeVisible();
      await expect(page.getByText("Активен", { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Чаты", exact: true }).click();
  } else {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Новый расчёт" })).toBeVisible();
    await expect(page.locator(".mobile-bottom-nav")).toHaveCount(0);

    let menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /Настройки/ }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    if (!external) await expect(page.getByText("Fixture HTTP Agent", { exact: true })).toBeVisible();

    menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /^Чат/ }).click();
    await expect(page.getByRole("heading", { name: "Новый расчёт" })).toBeVisible();
  }

  await page.screenshot({ path: `artifacts-shell-${testInfo.project.name}.png`, fullPage: true });

  if (external) {
    expect(violations).toEqual([]);
    return;
  }

  await page.getByRole("button", { name: /Механизированная штукатурка/ }).click();
  const editor = page.getByRole("dialog", { name: "Редактор сметы" });
  await expect(editor).toBeVisible({ timeout: 30_000 });

  if (testInfo.project.name === "desktop-chromium") {
    await expect(editor.locator("#estimate-title")).toHaveValue("Механизированная штукатурка 358 м²");
    const desktopEditor = page.getByTestId("desktop-estimate-editor");
    await expect(desktopEditor).toBeVisible();
    await expect(editor.locator(".estimate-summary")).toBeVisible();
    expect((await desktopEditor.boundingBox())?.width ?? 0).toBeGreaterThan(1200);
    await editor.locator("#quantity-work-1").fill("360");
    await editor.getByRole("button", { name: "Сохранить версию", exact: true }).first().click();
    await expect(editor.getByText("Версия 2", { exact: false }).first()).toBeVisible();
  } else {
    await expect(editor.getByRole("heading", { name: "Механизированная штукатурка 358 м²" })).toBeVisible();
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
    await editor.locator("#mobile-quantity-work-1").fill("360");
    await editor.getByRole("button", { name: "Сохранить версию", exact: true }).click();
  }

  await page.screenshot({ path: `artifacts-estimate-${testInfo.project.name}.png`, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Механизированная штукатурка 358 м²/ }).first()).toBeVisible();
  expect(violations).toEqual([]);
});
