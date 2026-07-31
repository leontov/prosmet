import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

type CspViolation = {
  violatedDirective: string;
  blockedURI: string;
  sourceFile: string;
  lineNumber: number;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as unknown as { __prosmetCspViolations?: CspViolation[] };
    scope.__prosmetCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      scope.__prosmetCspViolations?.push({
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber
      });
    });
  });
});

async function expectSecureInteractiveSurface(page: import("@playwright/test").Page) {
  const violations = await page.evaluate(() =>
    (window as unknown as { __prosmetCspViolations?: CspViolation[] }).__prosmetCspViolations ?? []
  );
  expect(violations).toEqual([]);

  const anonymousFields = await page
    .locator("input:not([id]), input:not([name]), textarea:not([id]), textarea:not([name]), select:not([id]), select:not([name])")
    .evaluateAll((elements) =>
      Array.from(new Set(elements)).map((element) => ({
        tag: element.tagName,
        type: element.getAttribute("type"),
        label: element.getAttribute("aria-label"),
        placeholder: element.getAttribute("placeholder")
      }))
    );
  expect(anonymousFields).toEqual([]);
}

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

test("premium V2 shell is a distinct desktop and mobile product", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что нужно посчитать?" })).toBeVisible();
  await expect(composer(page)).toHaveAttribute("placeholder", "Опишите объект и работы");
  await expect(page.getByTestId("starter-suggestions")).toBeVisible();

  await expect(page.getByText("IndexedDB-кэш готов", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Backend ·/)).toHaveCount(0);
  await expect(page.getByLabel("Прочитать вслух")).toHaveCount(0);
  await expect(page.getByLabel("Хороший ответ")).toHaveCount(0);
  await expect(page.getByLabel("Плохой ответ")).toHaveCount(0);

  const inputFontSize = await composer(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(inputFontSize).toBeGreaterThanOrEqual(16);

  if (testInfo.project.name === "desktop-chromium") {
    const sidebar = page.getByTestId("app-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("button", { name: "Новый чат" })).toBeVisible();
    await expect(page.locator(".prosmet-v2-mobile-nav")).toBeHidden();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(sidebarBox!.width).toBeGreaterThanOrEqual(250);
    await expect(page.getByTestId("right-inspector")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("app-sidebar")).toBeHidden();
    const mobileNav = page.locator(".prosmet-v2-mobile-nav");
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("button", { name: /Сметы/ })).toBeVisible();

    const cards = page.locator(".prosmet-v2-suggestion");
    await expect(cards).toHaveCount(4);
    const firstCard = cards.first();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.height).toBeGreaterThanOrEqual(88);
    expect(cardBox!.width).toBeGreaterThan(page.viewportSize()!.width - 60);
    const cardTitleSize = await firstCard.locator(".prosmet-v2-suggestion-title").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(cardTitleSize).toBeGreaterThanOrEqual(16);
  }

  await expectSecureInteractiveSurface(page);

  await page.screenshot({ path: `artifacts/screenshots/premium-shell-${testInfo.project.name}.png`, fullPage: true });

  const relevant = errors.filter((message) =>
    /Speech adapter|Feedback adapter|hydration|Maximum update depth|Too many re-renders|TypeError|ReferenceError|EvalError|Content Security Policy|Refused to evaluate|Page crashed/i.test(message)
  );
  expect(relevant).toEqual([]);
});

test("premium V2 estimate uses document workspace on desktop and large cards on mobile", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await send(page, "Составь смету механизированной штукатурки 96 м² в Казани, слой 15 мм. Объект: квартира Ивановых. Заказчик: Иванов Алексей.");

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
    expect(geometry.x).toBeGreaterThanOrEqual(250);
    expect(geometry.width).toBeGreaterThan(900);
    await expect(overlay.getByRole("complementary", { name: "Итоги сметы" })).toBeVisible();
    await expect(overlay.getByRole("button", { name: "Сохранить версию" }).last()).toBeVisible();
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
    expect(primaryBox!.y + primaryBox!.height).toBeGreaterThan(viewport.height - 96);
    expect(primaryBox!.height).toBeGreaterThanOrEqual(50);

    const meta = overlay.locator(".prosmet-premium-mobile-meta");
    await expect(meta).toBeVisible();
    await meta.locator("summary").click();
    await expect(overlay.locator('input[aria-label="Объект"]:visible')).toHaveValue("Квартира Ивановых");

    const firstRow = overlay.locator('button[aria-label$="— открыть позицию"]').first();
    await expect(firstRow).toBeVisible();
    const rowBox = await firstRow.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.height).toBeGreaterThanOrEqual(100);
    const rowTitleSize = await firstRow.locator("strong").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(rowTitleSize).toBeGreaterThanOrEqual(16);

    await firstRow.click();
    const rowEditor = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowEditor).toBeVisible();
    await expect(rowEditor.getByLabel("Количество")).toBeEditable();
    await expect(rowEditor.getByLabel("Цена")).toBeEditable();
    await expect(rowEditor.getByText("Дополнительно", { exact: true })).toBeVisible();
    const done = rowEditor.getByRole("button", { name: "Готово" });
    await expect(done).toBeVisible();
    const doneBox = await done.boundingBox();
    expect(doneBox).not.toBeNull();
    expect(doneBox!.height).toBeGreaterThanOrEqual(52);
  }

  await expectSecureInteractiveSurface(page);

  await page.screenshot({ path: `artifacts/screenshots/premium-estimate-${testInfo.project.name}.png`, fullPage: true });

  const titleOverflow = await canvas.locator('textarea[aria-label="Название сметы"], h1').first().evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(titleOverflow.scrollWidth).toBeLessThanOrEqual(titleOverflow.clientWidth + 2);

  const relevant = errors.filter((message) =>
    /Speech adapter|Feedback adapter|hydration|Maximum update depth|Too many re-renders|TypeError|ReferenceError|EvalError|Content Security Policy|Refused to evaluate|Page crashed/i.test(message)
  );
  expect(relevant).toEqual([]);
});
