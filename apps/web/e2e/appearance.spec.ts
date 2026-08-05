import { expect, test } from "@playwright/test";

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
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
    await page.keyboard.press("Escape");
    await expect(commandSurface).toBeHidden();

    const themeButton = page.getByRole("button", { name: /Тема:/ }).first();
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.prosmetTheme)).not.toBe("system");
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
  });
});
