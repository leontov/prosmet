import { expect, test, type Locator, type Page } from "@playwright/test";

function luminanceFromRgb(value: string) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  const red = channels[0];
  const green = channels[1];
  const blue = channels[2];
  if (red === undefined || green === undefined || blue === undefined) return 1;
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const linearRed = linear[0] ?? 1;
  const linearGreen = linear[1] ?? 1;
  const linearBlue = linear[2] ?? 1;
  return linearRed * 0.2126 + linearGreen * 0.7152 + linearBlue * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const left = luminanceFromRgb(first);
  const right = luminanceFromRgb(second);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

async function forceDarkTheme(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("prosmet.workspace.theme.v1", "dark");
  });
}

async function styleOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      border: style.borderColor
    };
  });
}

async function expectDarkLocator(locator: Locator, label: string) {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const style = await styleOf(locator);
  expect(luminanceFromRgb(style.background), `${label} must not remain a light surface`).toBeLessThan(0.12);
  expect(contrastRatio(style.color, style.background), `${label} text contrast`).toBeGreaterThanOrEqual(4.5);
}

async function expectDarkSurface(page: Page, selector: string, label: string) {
  await expectDarkLocator(page.locator(selector).first(), label);
}

async function expectEveryDarkSurface(locator: Locator, label: string) {
  const count = await locator.count();
  expect(count, `${label} must exist`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expectDarkLocator(locator.nth(index), `${label} ${index + 1}`);
  }
}

async function ensureSettingsAgent(page: Page) {
  const registryResponse = await page.request.get("/api/agents");
  if (registryResponse.ok()) {
    const registry = await registryResponse.json() as { agents?: unknown[] };
    if (Array.isArray(registry.agents) && registry.agents.length) return;
  }

  const created = await page.request.post("/api/agents", {
    headers: { "x-prosmet-admin-token": "e2e-admin" },
    data: {
      name: `Dark theme fixture ${Date.now()}`,
      type: "http-agent",
      enabled: true,
      baseUrl: "http://127.0.0.1:4174/run",
      timeoutMs: 30_000
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("ProSmet dark theme QA", () => {
  test.beforeEach(async ({ page }) => {
    await forceDarkTheme(page);
  });

  test("desktop dark theme is coherent across shell, command surface and registration", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only dark theme gate");

    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-prosmet-theme", "dark");
    await expect(page.getByTestId("desktop-shell")).toBeVisible();

    await expectDarkSurface(page, ".pro-desktop-sidebar", "Desktop sidebar");
    await expectDarkSurface(page, ".pro-desktop-main", "Desktop workspace");
    await expectDarkSurface(page, ".pro-desktop-topbar", "Desktop topbar");
    await expectDarkSurface(page, ".suggestion-card", "Suggestion card");
    await expectDarkSurface(page, ".desktop-composer", "Composer");
    if (await page.locator(".pro-current-project-link").count()) {
      await expectDarkSurface(page, ".pro-current-project-link", "Current project shortcut");
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "artifacts-dark-desktop-shell.png", fullPage: true });

    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const commandSurface = page.getByRole("region", { name: "Команды и поиск" });
    await expect(commandSurface).toBeVisible();
    await expectDarkSurface(page, ".pro-command-surface", "Command surface");
    await page.screenshot({ path: "artifacts-dark-desktop-command.png", fullPage: true });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Кабинет/ }).click();
    await expect(page.getByRole("heading", { name: "Кабинет" })).toBeVisible();
    await expectDarkSurface(page, ".desktop-account", "Desktop account canvas");
    await expectDarkSurface(page, ".account-auth-required", "Admin-session notice");
    await expectDarkSurface(page, ".account-block", "System status block");
    await expectDarkSurface(page, ".registration-panel", "Registration panel");
    await expectDarkSurface(page, ".registration-panel__form", "Registration form");
    await expect(page.locator(".status-row b").first()).toHaveCSS("color", /rgb\((?:24[0-9]|25[0-5]),/);
    await page.screenshot({ path: "artifacts-dark-desktop-account.png", fullPage: true });
  });

  test("desktop settings contain no light panels or unreadable provider cards", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop settings regression runs once");
    await ensureSettingsAgent(page);
    await page.goto("/app", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

    await expectDarkSurface(page, ".desktop-settings", "Desktop settings canvas");
    await expectEveryDarkSurface(page.locator(".settings-section > div"), "Settings section body");
    await expectDarkSurface(page, ".active-agent-summary", "Active agent summary");
    await expectDarkSurface(page, ".active-agent-summary > button", "Active agent refresh button");
    await expectEveryDarkSurface(page.locator(".toggle-row"), "Settings toggle row");
    await expectDarkSurface(page, ".settings-action", "Settings export row");
    await expectDarkSurface(page, ".settings-action > b", "Settings export action");
    await expectDarkSurface(page, ".admin-login", "Admin login area");
    await expectDarkSurface(page, ".admin-login input", "Admin token input");
    await expectDarkSurface(page, ".agent-settings", "Provider rail");
    await expectEveryDarkSurface(page.locator(".agent-connection"), "Provider card");
    await expectEveryDarkSurface(page.locator(".agent-connection > p"), "Provider endpoint surface");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "artifacts-dark-desktop-settings-regression.png", fullPage: true });
  });

  test("mobile dark theme covers chat, drawer, project search, account and settings surfaces", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only dark theme gate");
    await ensureSettingsAgent(page);

    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-prosmet-theme", "dark");
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();

    await expectDarkSurface(page, ".pro-mobile-stage", "Mobile stage");
    await expectDarkSurface(page, ".chat-reference-topbar", "Mobile topbar");
    await expectDarkSurface(page, ".mobile-reference-action", "Mobile quick action");
    await expectDarkSurface(page, ".mobile-reference-composer", "Mobile composer");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-dark-mobile-chat.png", fullPage: true });

    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    let drawer = page.getByRole("dialog", { name: "Навигация" });
    await expect(drawer).toBeVisible();
    await expectDarkSurface(page, ".pro-mobile-drawer", "Mobile drawer");
    await page.screenshot({ path: "artifacts-dark-mobile-drawer.png", fullPage: true });

    await drawer.getByRole("button", { name: "Проекты" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("projects-view")).toBeVisible();
    await expectDarkSurface(page, ".pro-search-field", "Mobile project search");
    const projectRow = page.locator(".pro-project-row").first();
    if (await projectRow.count()) await expectDarkSurface(page, ".pro-project-row", "Mobile project row");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-dark-mobile-projects.png", fullPage: true });

    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    drawer = page.getByRole("dialog", { name: "Навигация" });
    await drawer.getByRole("button", { name: "Профиль" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Кабинет" })).toBeVisible();
    await expectDarkSurface(page, ".mobile-account", "Mobile account canvas");
    await expectDarkSurface(page, ".account-auth-required", "Mobile admin-session notice");
    await expectDarkSurface(page, ".registration-panel", "Mobile registration panel");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-dark-mobile-account.png", fullPage: true });

    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    drawer = page.getByRole("dialog", { name: "Навигация" });
    await drawer.getByRole("button", { name: "Настройки" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await expectDarkSurface(page, ".mobile-settings", "Mobile settings canvas");
    await expectEveryDarkSurface(page.locator(".settings-section > div"), "Mobile settings section body");
    await expectEveryDarkSurface(page.locator(".toggle-row"), "Mobile settings toggle row");
    await expectDarkSurface(page, ".agent-settings", "Mobile provider rail");
    await expectEveryDarkSurface(page.locator(".agent-connection"), "Mobile provider card");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-dark-mobile-settings-regression.png", fullPage: true });
  });

  test("system theme follows a dark operating-system preference", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "System-theme contract runs once");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.addInitScript(() => {
      window.localStorage.setItem("prosmet.workspace.theme.v1", "system");
    });
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-prosmet-theme", "system");
    await expectDarkSurface(page, ".pro-desktop-sidebar", "System dark sidebar");
    await expectDarkSurface(page, ".pro-desktop-main", "System dark workspace");
  });
});
