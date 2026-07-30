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

test("a compact estimate card opens the focused desktop or mobile workspace", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await send(
    page,
    "Составь смету механизированной штукатурки 96 м² в Казани, слой 15 мм. Объект: квартира Ивановых. Заказчик: Иванов Алексей."
  );

  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-prosmet-supporting-artifact="true"]:visible')).toHaveCount(0);

  await card.getByRole("button", { name: /Открыть смету/ }).click();
  const workspace = page.getByTestId("estimate-workspace-layer");
  const editor = page.getByTestId("estimate-document-overlay");
  await expect(workspace).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-prosmet-estimate-open", "true");
  await expect(editor.getByLabel("Объект")).toHaveValue("Квартира Ивановых");
  await expect(editor.getByLabel("Заказчик")).toHaveValue("Иванов Алексей");

  if (testInfo.project.name === "desktop-chromium") {
    const sidebar = page.locator('[data-testid="app-sidebar"]:visible');
    await expect(sidebar).toHaveCount(1);
    await expect(composer(page)).not.toBeVisible();

    const [sidebarBox, editorBox] = await Promise.all([
      sidebar.boundingBox(),
      editor.boundingBox()
    ]);
    expect(sidebarBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(editorBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 3);
    expect(editorBox!.x + editorBox!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 3);
    expect(editorBox!.width).toBeGreaterThan(900);

    const price = editor.getByLabel("Цена позиции 1");
    await price.fill("650");
    await price.blur();
    await expect(editor.getByText("Автосохранено")).toBeVisible({ timeout: 10_000 });
  } else {
    const sheetBox = await editor.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x).toBeLessThanOrEqual(1);
    expect(sheetBox!.y).toBeLessThanOrEqual(1);
    expect(Math.abs(sheetBox!.width - page.viewportSize()!.width)).toBeLessThanOrEqual(2);

    await editor.locator('button[aria-label$="— открыть позицию"]').first().click();
    const rowSheet = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowSheet).toBeVisible();
    const rowBox = await rowSheet.locator("section").boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.y + rowBox!.height).toBeGreaterThan(page.viewportSize()!.height - 4);
    await page.screenshot({
      path: "artifacts/screenshots/estimate-row-sheet-mobile-chromium.png",
      fullPage: true
    });
    await rowSheet.getByLabel("Цена").fill("650");
    await rowSheet.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(rowSheet).toHaveCount(0);
  }

  await page.screenshot({
    path: `artifacts/screenshots/estimate-workspace-${testInfo.project.name}.png`,
    fullPage: true
  });

  const relevant = errors.filter((message) =>
    /hydration|Maximum update depth|Too many re-renders|TypeError|ReferenceError|validateDOMNesting|Page crashed/i.test(
      message
    )
  );
  expect(relevant).toEqual([]);
});
