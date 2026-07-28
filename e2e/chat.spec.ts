import { expect, test } from "@playwright/test";

test("request → technology → editable estimate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Какую смету подготовить?" })).toBeVisible();
  const input = page.getByLabel("Сообщение сметчику");
  await input.fill("Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Учти подготовку, маяки, углы, материалы, логистику и уборку.");
  await page.getByLabel("Отправить").click();
  await expect(page.getByText("Технологическая карта", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Редактируемая смета/)).toBeVisible({ timeout: 30_000 });
  const quantity = page.getByLabel(/Количество Механизированное нанесение/);
  await quantity.fill("360");
  await expect(page.getByRole("button", { name: /Сохранить сейчас|Revision сохранена/ })).toBeVisible();
  await expect(page.getByText(/Revision 2/)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByText(/Revision 2/)).toBeVisible({ timeout: 15_000 });
});

test("mobile composer has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await expect(page.getByLabel("Сообщение сметчику")).toBeVisible();
});
