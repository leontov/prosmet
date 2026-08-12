import { expect, test } from "@playwright/test";

async function assertViewportGeometry(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const welcome = document.querySelector<HTMLElement>(".desktop-welcome, .mobile-reference-empty");
    const composer = document.querySelector<HTMLElement>(".desktop-composer, .mobile-reference-composer");
    const actions = document.querySelectorAll<HTMLElement>(".suggestion-card, .mobile-reference-action");
    const sidebar = document.querySelector<HTMLElement>(".desktop-sidebar, .pro-desktop-sidebar");
    const desktopShell = document.querySelector<HTMLElement>("[data-testid=desktop-shell], .desktop-shell, .pro-desktop-shell");
    const gridColumns = desktopShell
      ? getComputedStyle(desktopShell).gridTemplateColumns.split(" ").map(Number).filter(Number.isFinite)
      : [];
    const sidebarWidth = sidebar?.getBoundingClientRect().width || gridColumns[0] || 0;
    return {
      viewport,
      welcome: welcome ? { x: welcome.getBoundingClientRect().x, width: welcome.getBoundingClientRect().width } : null,
      composer: composer ? {
        x: composer.getBoundingClientRect().x,
        width: composer.getBoundingClientRect().width,
        bottom: viewport.height - composer.getBoundingClientRect().bottom
      } : null,
      actionCount: actions.length,
      sidebarWidth,
      overflow: document.documentElement.scrollWidth - viewport.width
    };
  });

  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.actionCount).toBe(3);
  expect(geometry.composer).not.toBeNull();

  if (geometry.viewport.width >= 768) {
    // Current ProSmet shell uses a 236–254px utility rail depending on viewport/layout rounding.
    expect(geometry.sidebarWidth).toBeGreaterThanOrEqual(220);
    expect(geometry.sidebarWidth).toBeLessThanOrEqual(260);
    expect(Math.abs((geometry.welcome?.width ?? 0) - (geometry.composer?.width ?? 0))).toBeLessThanOrEqual(80);
  } else {
    expect(geometry.composer!.width).toBeGreaterThanOrEqual(geometry.viewport.width - 32);
    expect(geometry.composer!.bottom).toBeLessThanOrEqual(24);
  }
}

test("Sam Reshu-style landing geometry remains stable", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.PROSMET_BASE_URL), "Uses local deterministic UI fixture");
  await page.goto("/app", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Чем я могу помочь сегодня?" })).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByPlaceholder("Опишите, что нужно сделать…")).toBeVisible();
  } else {
    await expect(page.locator("#mobile-message")).toHaveAttribute(
      "placeholder",
      /Спросить ProSmet…|Опишите, что нужно сделать…/
    );
  }
  await assertViewportGeometry(page);

  await page.screenshot({
    path: `artifacts-samreshuuu-${test.info().project.name}.png`,
    fullPage: true
  });
});
