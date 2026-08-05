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
  await expect(page.getByRole("heading", { name: "Создайте пользователя ProSmet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Зарегистрироваться" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Вход" })).toBeVisible();
  await page.screenshot({
    path: `artifacts-registration-${testInfo.project.name}.png`,
    fullPage: true
  });
});
