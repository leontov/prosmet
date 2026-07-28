import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function composer(page: import("@playwright/test").Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function openMenuIfMobile(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Открыть меню" });
  if (await button.isVisible()) await button.click();
}

function watchRuntimeErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function relevantRuntimeErrors(errors: string[]) {
  return errors.filter((message) =>
    /Content Security Policy|Refused to execute inline script|hydration|Connection closed/i.test(
      message
    )
  );
}

test.beforeAll(async () => {
  await mkdir("artifacts/screenshots", { recursive: true });
});

test("Codex desktop shell hydrates without CSP errors and exposes both sidebars", async ({
  page
}, testInfo) => {
  const runtimeErrors = watchRuntimeErrors(page);
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(composer(page)).toBeVisible();

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).toContain("'unsafe-inline'");
  expect(csp).toContain("'wasm-unsafe-eval'");

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    const inspector = page.getByTestId("right-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Рабочий контекст", { exact: true })).toBeVisible();
    await expect(inspector.getByText("PostgreSQL", { exact: true })).toBeVisible();
    await expect(inspector.getByText(/Подключено/)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Рабочий контекст" })).toBeVisible();
  }

  const backend = await page.request.get("/api/backend/status");
  expect(backend.ok()).toBeTruthy();
  const status = (await backend.json()) as {
    ok?: boolean;
    database?: { connected?: boolean };
    agent?: { streaming?: boolean };
  };
  expect(status.ok).toBe(true);
  expect(status.database?.connected).toBe(true);
  expect(status.agent?.streaming).toBe(true);
  expect(relevantRuntimeErrors(runtimeErrors)).toEqual([]);

  await page.screenshot({
    path: `artifacts/screenshots/chat-empty-${testInfo.project.name}.png`,
    fullPage: true
  });
});

test("streaming chat creates a technology card and editable estimate", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Смета и документы/ })).toBeVisible();
  await expect(composer(page)).toBeVisible();

  await composer(page).fill(
    "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Учти подготовку, маяки, углы, материалы, логистику и уборку."
  );
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(page.getByText(/Подготовил технологическую карту/)).toBeVisible();
  await expect(page.getByText(/технологических операций/)).toBeVisible();
  const editor = page.getByTestId("estimate-editor");
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor.getByLabel("Название сметы")).toHaveValue(
    "Механизированная гипсовая штукатурка — 358 м²"
  );

  const price = editor.getByLabel("Цена позиции 1").first();
  await price.fill("50");
  await expect(price).toHaveValue("50");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Утвердить", exact: true }).click();
  await expect(editor.getByText("Утверждена", { exact: true })).toBeVisible();

  const dbExists = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === "prosmet-local-v2");
  });
  expect(dbExists).toBeTruthy();

  await openMenuIfMobile(page);
  await expect(page.getByTestId("app-sidebar")).toHaveCount(1);
  await page.screenshot({
    path: `artifacts/screenshots/estimate-${testInfo.project.name}.png`,
    fullPage: true
  });
});

test("reload restores the active conversation and local estimate", async ({ page }) => {
  await page.goto("/");
  await composer(page).fill(
    "Составь полную смету механизированной штукатурки 120 м² в Казани, слой 10 мм."
  );
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByTestId("estimate-editor")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("estimate-editor")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Название сметы")).toHaveValue(
    "Механизированная гипсовая штукатурка — 120 м²"
  );
});

test("stop button cancels an active streaming run", async ({ page }) => {
  await page.goto("/");
  await composer(page).fill("Расскажи, как Просметчик составляет профессиональную смету.");
  await page.getByRole("button", { name: "Отправить" }).click();
  const stop = page.getByRole("button", { name: "Остановить генерацию" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(composer(page)).toBeEnabled();
});
