import { expect, test } from "@playwright/test";

test.describe("production landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/landing");
  });

  test("shows the product promise and interactive estimate demo", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /От запроса до КС-3/ })).toBeVisible();
    await expect(page.getByText("Ремонт ванной комнаты", { exact: true })).toBeVisible();
    await expect(page.getByText("Предварительная стоимость", { exact: true })).toBeVisible();

    const prompt = page.getByRole("textbox", { name: "Запрос для демонстрации" });
    await prompt.fill("Составь смету на механизированную штукатурку 358 м² в Татарстане");
    await page.getByRole("button", { name: "Запустить демонстрацию" }).click();
    await expect(page.getByText(/Проверяю состав работ/)).toBeVisible();
    await expect(page.getByText("Расчёт готов", { exact: true })).toBeVisible();
  });

  test("keeps the production application available on app route", async ({ page }, testInfo) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    if (testInfo.project.name === "mobile-chromium") {
      await expect(page.getByTestId("mobile-shell")).toBeVisible();
      await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    } else {
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Что нужно рассчитать?" })).toBeVisible();
    }
  });

  test("exposes real application and enterprise conversion paths", async ({ page }) => {
    const appLink = page.getByRole("link", { name: /Составить первую смету/ });
    await expect(appLink).toHaveAttribute("href", "/app");

    await page.getByRole("textbox", { name: "Имя" }).fill("Тестовый пользователь");
    await page.getByRole("textbox", { name: "Рабочий телефон или email" }).fill("test@example.com");
    await page.getByRole("textbox", { name: "Компания и число сотрудников" }).fill("Строй QA, 12");
    await page.getByRole("button", { name: /Получить план внедрения/ }).click();
    await expect(page.getByText("Заявка принята", { exact: true })).toBeVisible();
  });

  test("has no horizontal overflow on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only geometry assertion");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
  });
});
