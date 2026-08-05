import { expect, test, type Page } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = "e2e-admin";

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function createVisualEstimate(page: Page, suffix: string) {
  const registryResponse = await page.request.get("/api/agents");
  expect(registryResponse.ok(), await registryResponse.text()).toBeTruthy();
  const registry = await registryResponse.json() as { agents?: Array<{ id: string; name: string; active?: boolean }> };
  let agent = registry.agents?.find((entry) => entry.name === "Fixture HTTP Agent");

  if (!agent) {
    const created = await page.request.post("/api/agents", {
      headers: { "x-prosmet-admin-token": adminToken },
      data: {
        name: "Fixture HTTP Agent",
        type: "http-agent",
        enabled: true,
        baseUrl: "http://127.0.0.1:4174/run",
        timeoutMs: 30_000
      }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    agent = await created.json() as { id: string; name: string; active?: boolean };
  }

  if (!agent.active) {
    const activated = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/activate`, {
      headers: { "x-prosmet-admin-token": adminToken }
    });
    expect(activated.ok(), await activated.text()).toBeTruthy();
  }

  const response = await page.request.post("/api/agent", {
    data: {
      requestId: `appearance-${suffix}-${Date.now()}`,
      messages: [{
        role: "user",
        content: "Составь смету на механизированную штукатурку стен 358 м² в Республике Татарстан: работы, материалы и сопутствующие расходы."
      }]
    }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = await response.json() as { artifact?: { id?: string } | null };
  expect(result.artifact?.id).toBeTruthy();
  const estimateResponse = await page.request.get(`/api/estimates/${encodeURIComponent(result.artifact!.id!)}`);
  expect(estimateResponse.ok(), await estimateResponse.text()).toBeTruthy();
  return estimateResponse.json() as Promise<{ id: string; title: string }>;
}

test.describe("ProSmet web appearance", () => {
  test("desktop workspace remains dense, stable and keyboard-accessible at target widths", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only visual contract");

    for (const viewport of [
      { width: 1024, height: 768, label: "compact" },
      { width: 1280, height: 800, label: "standard" },
      { width: 1440, height: 900, label: "primary" },
      { width: 1920, height: 1080, label: "wide" }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/app", { waitUntil: "networkidle" });
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Что нужно рассчитать?" })).toBeVisible();
      expect(await horizontalOverflow(page), `${viewport.label} viewport overflow`).toBeLessThanOrEqual(1);

      if (viewport.label === "primary" || viewport.label === "compact") {
        await page.screenshot({ path: `artifacts-web-appearance-desktop-${viewport.label}.png`, fullPage: true });
      }
    }
  });

  test("desktop command surface, sidebar collapse and theme controls are functional", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only chrome contract");
    await page.goto("/app", { waitUntil: "networkidle" });

    const sidebarToggle = page.getByRole("button", { name: "Свернуть левый сайдбар" });
    await expect(sidebarToggle).toBeVisible();
    await sidebarToggle.click();
    await expect(page.getByRole("button", { name: "Развернуть левый сайдбар" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const commandSurface = page.getByRole("region", { name: "Команды и поиск" });
    await expect(commandSurface).toBeVisible();
    await commandSurface.getByRole("textbox").fill("документы");
    await expect(commandSurface.getByRole("button", { name: /Открыть документы/ })).toBeVisible();
    await page.screenshot({ path: "artifacts-web-appearance-desktop-command.png", fullPage: true });
    await page.keyboard.press("Escape");
    await expect(commandSurface).toBeHidden();

    const themeButton = page.getByRole("button", { name: /Тема:/ }).first();
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.prosmetTheme)).not.toBe("system");
  });

  test("desktop estimate and PDF stay inside a resizable right canvas", async ({ page }, testInfo) => {
    test.skip(external || testInfo.project.name !== "desktop-chromium", "Local desktop canvas evidence runs once");
    const estimate = await createVisualEstimate(page, "desktop");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app", { waitUntil: "networkidle" });

    const estimateButton = page.locator(".pro-sidebar-history .history-item").filter({ hasText: estimate.title }).first();
    await expect(estimateButton).toBeVisible();
    await estimateButton.click();
    await expect(page.getByRole("complementary", { name: estimate.title })).toBeVisible();
    await expect(page.getByTestId("desktop-estimate-editor")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-web-appearance-desktop-estimate-canvas.png", fullPage: true });

    const canvasResizer = page.getByRole("separator", { name: "Изменить ширину правого канваса" });
    await canvasResizer.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(canvasResizer).toBeFocused();

    await page.getByRole("button", { name: "Скачать PDF" }).first().click();
    const pdfPreview = page.getByRole("region", { name: "Предпросмотр PDF" });
    await expect(pdfPreview).toBeVisible({ timeout: 20_000 });
    await expect(pdfPreview.locator("iframe")).toBeVisible();
    await page.screenshot({ path: "artifacts-web-appearance-desktop-pdf-canvas.png", fullPage: true });
  });

  test("mobile web matches the accepted on-demand drawer and single-canvas layout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only visual contract");
    await page.goto("/app", { waitUntil: "networkidle" });

    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-web-appearance-mobile-chat.png", fullPage: true });

    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    const drawer = page.getByRole("dialog", { name: "Навигация" });
    await expect(drawer).toBeVisible();
    await page.screenshot({ path: "artifacts-web-appearance-mobile-drawer.png", fullPage: true });
    await drawer.getByRole("button", { name: "Проекты" }).click();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-web-appearance-mobile-projects.png", fullPage: true });
  });

  test("mobile estimate editor keeps full functionality in one native-feeling canvas", async ({ page }, testInfo) => {
    test.skip(external || testInfo.project.name !== "mobile-chromium", "Local mobile editor evidence runs once");
    const estimate = await createVisualEstimate(page, "mobile");
    await page.goto("/app", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    const drawer = page.getByRole("dialog", { name: "Навигация" });
    await drawer.getByRole("button", { name: "Сметы" }).click();
    const estimateButton = page.getByTestId("estimates-view").getByRole("button").filter({ hasText: estimate.title }).first();
    await expect(estimateButton).toBeVisible();
    await estimateButton.click();
    await expect(page.getByTestId("mobile-estimate-editor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-web-appearance-mobile-estimate.png", fullPage: true });
  });
});
