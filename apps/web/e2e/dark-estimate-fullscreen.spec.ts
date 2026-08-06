import { expect, test, type Page } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = "e2e-admin";

function luminanceFromRgb(value: string) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  const [red = 255, green = 255, blue = 255] = channels;
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (linear[0] ?? 1) * 0.2126 + (linear[1] ?? 1) * 0.7152 + (linear[2] ?? 1) * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const left = luminanceFromRgb(first);
  const right = luminanceFromRgb(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

async function expectDarkSurface(page: Page, selector: string, label: string) {
  const values = await page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(luminanceFromRgb(values.background), `${label} must not remain white`).toBeLessThan(0.12);
  expect(contrastRatio(values.color, values.background), `${label} text contrast`).toBeGreaterThanOrEqual(4.5);
}

async function createEstimate(page: Page) {
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
      requestId: `dark-estimate-fullscreen-${Date.now()}`,
      messages: [{
        role: "user",
        content: "Составь смету на штукатурно-малярные работы в жилом доме: подготовка, материалы, работы и итог."
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

test("dark estimate canvas fills the viewport and contains no white editor panels", async ({ page }, testInfo) => {
  test.skip(external || testInfo.project.name !== "desktop-chromium", "Local desktop visual regression runs once");

  const estimate = await createEstimate(page);
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem("prosmet.workspace.theme.v1", "dark");
  });
  await page.goto("/app", { waitUntil: "networkidle" });

  const estimateButton = page.locator(".pro-sidebar-history .history-item").filter({ hasText: estimate.title }).first();
  await expect(estimateButton).toBeVisible();
  await estimateButton.click();
  await expect(page.getByTestId("desktop-estimate-editor")).toBeVisible();

  await expectDarkSurface(page, ".meta-static", "Updated metadata card");
  await expectDarkSurface(page, ".estimate-section > header", "Estimate section header");

  await page.getByRole("button", { name: "Открыть канвас на весь экран" }).click();
  const frame = page.getByTestId("workspace-canvas-frame");
  await expect(frame).toHaveClass(/canvas-fullscreen/);

  const geometry = await page.locator(".pro-workspace-canvas").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      frameColumns: getComputedStyle(element.parentElement!).gridTemplateColumns
    };
  });
  expect(Math.abs(geometry.left), "Fullscreen canvas left edge").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.right - geometry.viewportWidth), "Fullscreen canvas right edge").toBeLessThanOrEqual(1);
  expect(geometry.width, "Fullscreen canvas width").toBeGreaterThanOrEqual(geometry.viewportWidth - 2);
  expect(geometry.frameColumns.split(" ").filter(Boolean)).toHaveLength(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts-dark-desktop-estimate-fullscreen-regression.png", fullPage: true });
});
