import { expect, test } from "@playwright/test";

test("greenfield shell, navigation and estimate editor are native to each viewport", async ({ page }, testInfo) => {
  const violations: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") violations.push(message.text()); });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP:${event.violatedDirective}:${event.blockedURI}`);
    });
  });

  await page.goto("/");
  await expect(page.getByText("Просметчик", { exact: true })).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByTestId("desktop-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Что нужно сделать?" })).toBeVisible();
  } else {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Новый расчёт" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Мобильная навигация" });
    expect((await nav.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(70);
  }

  await page.getByRole("button", { name: /Механизированная штукатурка/ }).click();
  const editor = page.getByRole("dialog", { name: "Редактор сметы" });
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await expect(editor.getByText("Механизированная штукатурка квартиры", { exact: true })).toBeVisible();

  if (testInfo.project.name === "mobile-chromium") {
    const card = editor.locator(".mobile-estimate-item").first();
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(112);
    const fontSize = await card.locator("strong").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  }

  await page.screenshot({ path: `artifacts-${testInfo.project.name}.png`, fullPage: true });
  expect(violations).toEqual([]);
});
