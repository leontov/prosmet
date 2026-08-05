import { expect, test, type Page } from "@playwright/test";

async function openAccount(page: Page, projectName: string) {
  await page.goto("/app", { waitUntil: "networkidle" });
  if (projectName === "mobile-chromium") {
    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    const drawer = page.getByRole("dialog", { name: "Навигация" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /Профиль/ }).click();
  } else {
    await page.getByRole("button", { name: /Кабинет/ }).click();
  }
}

test("account screen exposes registration and login", async ({ page }, testInfo) => {
  await openAccount(page, testInfo.project.name);
  const panel = page.locator(".registration-panel");
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Создайте пользователя ProSmet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Зарегистрироваться" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Вход" })).toBeVisible();

  const geometry = await panel.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewport: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);

  await panel.screenshot({
    path: `artifacts-registration-panel-${testInfo.project.name}.png`
  });
  await page.screenshot({
    path: `artifacts-registration-${testInfo.project.name}.png`,
    fullPage: true
  });
});
