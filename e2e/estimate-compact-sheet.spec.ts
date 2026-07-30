import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function composer(page: import("@playwright/test").Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function sendPrompt(page: import("@playwright/test").Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  const send = page.getByRole("button", { name: "Отправить" });
  await expect(send).toBeEnabled();
  await send.click();
}

test.beforeAll(async () => {
  await mkdir("artifacts/screenshots", { recursive: true });
});

test("estimate result stays compact and opens a responsive editor sheet", async ({
  page
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Составь смету механизированной гипсовой штукатурки 358 м² в Лениногорске, слой 15 мм. Учти технологию, материалы, маяки, углы, логистику и уборку."
  );

  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/₽|RUB/)).toBeVisible();

  // Service artifacts remain in the persisted AG-UI state, but no longer form
  // a long customer-facing stack before the estimate card.
  await expect(page.getByText("Карточка задачи", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Технологическая карта", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Независимая проверка", { exact: true })).toHaveCount(0);

  await card.getByRole("button", { name: /Открыть смету/ }).click();
  const overlay = page.getByTestId("estimate-document-overlay");
  await expect(overlay).toBeVisible();

  const box = await overlay.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) throw new Error("Editor geometry is unavailable");

  if (testInfo.project.name === "desktop-chromium") {
    expect(box.x).toBeGreaterThan(250);
    expect(box.width).toBeLessThan(viewport.width - 200);
    expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(2);
    await expect(overlay.getByLabel("Цена позиции 1")).toBeVisible();
  } else {
    expect(box.y).toBeGreaterThan(20);
    expect(box.height).toBeLessThan(viewport.height);
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(3);
    await overlay.getByRole("button", { name: /Укрытие и защита поверхностей/ }).click();
    const rowEditor = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowEditor).toBeVisible();
    await expect(rowEditor.getByLabel("Цена")).toBeEditable();
  }

  await page.screenshot({
    path: `artifacts/screenshots/estimate-compact-sheet-${testInfo.project.name}.png`,
    fullPage: true
  });
});

test("owner can create an A2A development plan inside the chat", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Открой режим разработчика A2A и подключи команду ИИ-разработчиков для продолжения проекта"
  );

  const card = page.getByTestId("developer-workspace-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button").click();

  const dialog = page.getByRole("dialog", { name: "Режим разработчика" });
  await expect(dialog).toBeVisible();
  const task = dialog.getByLabel("Задача команде разработчиков");
  await task.fill(
    "Переделай редактор сметы, проверь desktop и mobile, исправь CI и подготовь релиз на порт 3200"
  );
  await dialog.getByRole("button", { name: "Сформировать план" }).click();
  await expect(dialog.getByTestId("developer-task-plan")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText("План готов", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/право: deploy/)).toBeVisible();

  await page.screenshot({
    path: `artifacts/screenshots/developer-workspace-${testInfo.project.name}.png`,
    fullPage: true
  });
});
