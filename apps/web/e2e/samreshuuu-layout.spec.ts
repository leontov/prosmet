import { expect, test } from "@playwright/test";

async function assertLandingGeometry(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const hero = document.querySelector<HTMLElement>(".sam-hero");
    const copy = document.querySelector<HTMLElement>(".sam-hero-copy");
    const command = document.querySelector<HTMLElement>(".sam-command-card");
    const nav = document.querySelector<HTMLElement>(".sam-nav");
    const overflow = document.documentElement.scrollWidth - viewport.width;
    return {
      viewport,
      heroWidth: hero?.getBoundingClientRect().width ?? 0,
      copyWidth: copy?.getBoundingClientRect().width ?? 0,
      commandWidth: command?.getBoundingClientRect().width ?? 0,
      commandHeight: command?.getBoundingClientRect().height ?? 0,
      navVisible: nav ? getComputedStyle(nav).display !== "none" : false,
      overflow,
    };
  });

  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.heroWidth).toBeGreaterThan(0);
  expect(geometry.commandWidth).toBeGreaterThan(0);
  expect(geometry.commandHeight).toBeGreaterThan(300);

  if (geometry.viewport.width >= 900) {
    expect(geometry.copyWidth).toBeGreaterThan(360);
    expect(geometry.commandWidth).toBeGreaterThan(480);
  } else {
    expect(geometry.commandWidth).toBeGreaterThanOrEqual(geometry.viewport.width - 32);
    expect(geometry.copyWidth).toBeGreaterThan(0);
  }
}

test("Sam Reshu-style landing geometry remains stable", async ({ page }, testInfo) => {
  await page.goto("/landing", { waitUntil: "networkidle" });
  await expect(page.locator(".sam-home")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Один агент — для смет, документов и всего между ними." })).toBeVisible();
  await expect(page.getByText("Результат", { exact: true })).toBeVisible();
  await assertLandingGeometry(page);

  await page.screenshot({
    path: `artifacts-samreshuuu-${testInfo.project.name}.png`,
    fullPage: true
  });
});
