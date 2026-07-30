import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function composer(page: import("@playwright/test").Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function send(page: import("@playwright/test").Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  await page.getByRole("button", { name: "Отправить" }).click();
}

test.beforeAll(async () => {
  await mkdir("artifacts/screenshots", { recursive: true });
});

test("premium shell keeps the customer surface quiet and task focused", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что нужно посчитать?" })).toBeVisible();
  await expect(composer(page)).toHaveAttribute("placeholder", "Опишите объект и работы");

  await expect(page.getByText("IndexedDB-кэш готов", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Backend ·/)).toHaveCount(0);
  await expect(page.getByLabel("Прочитать вслух")).toHaveCount(0);
  await expect(page.getByLabel("Хороший ответ")).toHaveCount(0);
  await expect(page.getByLabel("Плохой ответ")).toHaveCount(0);

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Новый чат" })).toBeVisible();
    await expect(page.getByTestId("right-inspector")).toHaveCount(0);
  }

  await page.screenshot({
    path: `artifacts/screenshots/premium-shell-${testInfo.project.name}.png`,
    fullPage: true
  });

  const relevant = errors.filter((message) =>
    /Speech adapter|Feedback adapter|hydration|Maximum update depth|Too many re-renders|TypeError|ReferenceError|Page crashed/i.test(message)
  );
  expect(relevant).toEqual([]);
});

test("premium estimate opens as a clean adaptive document workflow", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await send(
    page,
    "Составь смету механизированной штукатурки 96 м² в Казани, слой 15 мм. Объект: квартира Ивановых. Заказчик: Иванов Алексей."
  );

  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: /Открыть смету/ }).click();

  const overlay = page.getByTestId("estimate-document-overlay");
  const canvas = page.getByTestId("estimate-document-canvas");
  await expect(overlay).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(overlay.getByRole("button", { name: "Скачать PDF" })).toBeVisible();
  await expect(overlay.getByRole("button", { name: "Передать клиенту" })).toBeVisible();
  await expect(overlay.getByText("07/30/2026", { exact: true })).toHaveCount(0);

  const geometry = await overlay.boundingBox();
  const viewport = page.viewportSize();
  expect(geometry).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!geometry || !viewport) throw new Error("Premium estimate geometry is unavailable");

  if (testInfo.project.name === "desktop-chromium") {
    expect(geometry.x).toBeGreaterThanOrEqual(260);
    expect(geometry.width).toBeGreaterThan(900);
    await expect(overlay.getByRole("button", { name: "Сохранить версию" })).toBeVisible();
    await overlay.getByLabel("Цена позиции 1").fill("650");
    await overlay.getByLabel("Цена позиции 1").blur();
    await expect(overlay.getByText("Автосохранено")).toBeVisible({ timeout: 10_000 });
  } else {
    expect(geometry.x).toBeLessThanOrEqual(1);
    expect(geometry.y).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.width - viewport.width)).toBeLessThanOrEqual(2);

    const mobilePrimary = overlay.getByRole("button", { name: "Сохранить версию" });
    await expect(mobilePrimary).toBeVisible();
    const primaryBox = await mobilePrimary.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(primaryBox!.y + primaryBox!.height).toBeGreaterThan(viewport.height - 90);

    const meta = overlay.locator(".prosmet-premium-mobile-meta");
    await expect(meta).toBeVisible();
    await meta.locator("summary").click();
    await expect(overlay.getByLabel("Объект")).toHaveValue("Квартира Ивановых");

    const firstRow = overlay.locator('button[aria-label$="— открыть позицию"]').first();
    await firstRow.click();
    const rowEditor = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowEditor).toBeVisible();
    await expect(rowEditor.getByLabel("Количество")).toBeEditable();
    await expect(rowEditor.getByLabel("Цена")).toBeEditable();
    await expect(rowEditor.getByText("Дополнительно", { exact: true })).toBeVisible();
    await expect(rowEditor.getByRole("button", { name: "Готово" })).toBeVisible();
  }

  await page.screenshot({
    path: `artifacts/screenshots/premium-estimate-${testInfo.project.name}.png`,
    fullPage: true
  });

  const titleOverflow = await canvas.locator('textarea[aria-label="Название сметы"], h1').first().evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(titleOverflow.scrollWidth).toBeLessThanOrEqual(titleOverflow.clientWidth + 2);

  const relevant = errors.filter((message) =>
    /Speech adapter|Feedback adapter|hydration|Maximum update depth|Too many re-renders|TypeError|ReferenceError|Page crashed/i.test(message)
  );
  expect(relevant).toEqual([]);
});
