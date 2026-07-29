import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const DB_NAME = "prosmet-cache-v3";
const REQUIRED_STORES = [
  "meta",
  "threads",
  "messages",
  "estimates",
  "estimateRevisions",
  "documents",
  "documentRevisions",
  "prices",
  "canonicalWorks",
  "priceObservations",
  "priceHistory",
  "marketPriceBuckets",
  "priceResearchEvidence",
  "files",
  "outbox",
  "syncState"
];

function composer(page: import("@playwright/test").Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function waitForLocalCache(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ databaseName, requiredStores }) => {
            const databases = await indexedDB.databases();
            if (!databases.some((database) => database.name === databaseName)) return false;
            return new Promise<boolean>((resolve) => {
              const request = indexedDB.open(databaseName);
              request.onerror = () => resolve(false);
              request.onsuccess = () => {
                const database = request.result;
                const ready = requiredStores.every((store) =>
                  database.objectStoreNames.contains(store)
                );
                database.close();
                resolve(ready);
              };
            });
          },
          { databaseName: DB_NAME, requiredStores: REQUIRED_STORES }
        ),
      { timeout: 15_000, message: "IndexedDB schema did not become ready" }
    )
    .toBe(true);
}

async function waitForPersistedEstimateMessage(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async (databaseName) =>
            new Promise<boolean>((resolve) => {
              const request = indexedDB.open(databaseName);
              request.onerror = () => resolve(false);
              request.onsuccess = () => {
                const database = request.result;
                try {
                  const transaction = database.transaction("messages", "readonly");
                  const messages = transaction.objectStore("messages").getAll();
                  transaction.oncomplete = () => {
                    const persisted = (messages.result as Array<{ message?: unknown }>).some(
                      (record) => JSON.stringify(record.message ?? {}).includes("estimate_draft")
                    );
                    database.close();
                    resolve(persisted);
                  };
                  transaction.onerror = () => {
                    database.close();
                    resolve(false);
                  };
                } catch {
                  database.close();
                  resolve(false);
                }
              };
            }),
          DB_NAME
        ),
      {
        timeout: 30_000,
        message: "Completed assistant estimate message was not persisted to IndexedDB history"
      }
    )
    .toBe(true);
}

async function sendPrompt(page: import("@playwright/test").Page, prompt: string) {
  await waitForLocalCache(page);
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  await expect(input).toHaveValue(prompt);
  const send = page.getByRole("button", { name: "Отправить" });
  await expect(send).toBeEnabled();
  await send.click();
}

async function openMenuIfMobile(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Открыть меню" });
  if (await button.isVisible()) await button.click();
}

function visibleSidebar(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="app-sidebar"]:visible');
}

function visibleInspector(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="right-inspector"]:visible');
}

function watchRuntimeErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("crash", () => errors.push("Page crashed"));
  return errors;
}

function relevantRuntimeErrors(errors: string[]) {
  return errors.filter((message) =>
    /Content Security Policy|Refused to execute inline script|Refused to evaluate|blocks the use of ['"]eval['"]|unsafe-eval|EvalError|hydration|Connection closed|randomUUID is not a function|sql-wasm|both async and sync fetching|wasm streaming compile failed|ZodError|messageId.*Required|Maximum update depth exceeded|Too many re-renders|Page crashed|out of memory|IndexedDB.*not found|validateDOMNesting/i.test(
      message
    )
  );
}

test.beforeAll(async () => {
  await mkdir("artifacts/screenshots", { recursive: true });
});

test("plain HTTP boots with native IndexedDB and no browser WASM", async ({ page }) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.addInitScript(() => {
    try {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: undefined
      });
    } catch {
      // The compatibility helper must still leave the application usable.
    }
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()["cache-control"] ?? "").toContain("no-store");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(composer(page)).toBeEditable();
  await waitForLocalCache(page);
  await expect(page.getByText(/Локальный кэш не открылся/)).toHaveCount(0);

  const favicon = await page.request.get("/favicon.ico");
  expect(favicon.ok()).toBeTruthy();

  const localDatabase = await page.evaluate(async (databaseName) => {
    const databases = await indexedDB.databases();
    return databases.find((database) => database.name === databaseName);
  }, DB_NAME);
  expect(localDatabase?.name).toBe(DB_NAME);
  expect(Number(localDatabase?.version)).toBeGreaterThanOrEqual(3);

  for (const obsolete of ["/sql-wasm.wasm", "/sql-wasm-browser.wasm"]) {
    const asset = await page.request.get(obsolete);
    expect(asset.status()).toBe(404);
  }

  expect(relevantRuntimeErrors(runtimeErrors)).toEqual([]);
});

test("hydrated client remains responsive and keeps text typed during startup", async ({ page }) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

  const input = composer(page);
  await input.fill("Проверка отзывчивости интерфейса");
  await expect(input).toHaveValue("Проверка отзывчивости интерфейса");
  await waitForLocalCache(page);
  await expect(input).toHaveValue("Проверка отзывчивости интерфейса");
  await expect(page.getByRole("button", { name: "Отправить" })).toBeEnabled();

  const completedFrames = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        let frames = 0;
        const timeout = window.setTimeout(
          () => reject(new Error(`Browser stopped responding after ${frames} animation frames`)),
          3000
        );
        const next = () => {
          frames += 1;
          if (frames >= 12) {
            window.clearTimeout(timeout);
            resolve(frames);
            return;
          }
          window.requestAnimationFrame(next);
        };
        window.requestAnimationFrame(next);
      })
  );
  expect(completedFrames).toBe(12);

  await input.fill("");
  await expect(input).toHaveValue("");
  await page.waitForTimeout(750);
  expect(relevantRuntimeErrors(runtimeErrors)).toEqual([]);
});

test("Codex desktop shell hydrates without eval and exposes both sidebars", async ({
  page
}, testInfo) => {
  const runtimeErrors = watchRuntimeErrors(page);
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(composer(page)).toBeEditable();
  await waitForLocalCache(page);

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).toContain("'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toContain("'wasm-unsafe-eval'");

  if (testInfo.project.name === "desktop-chromium") {
    await expect(visibleSidebar(page)).toHaveCount(1);
    const inspector = visibleInspector(page);
    await expect(inspector).toHaveCount(1);
    await expect(inspector.getByText("Рабочий контекст", { exact: true })).toBeVisible();
    await expect(inspector.getByText("PostgreSQL", { exact: true })).toBeVisible();
    await expect(inspector.getByText("IndexedDB", { exact: true })).toBeVisible();
    await expect(inspector.getByText(/Подключено/)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Рабочий контекст" })).toBeVisible();
  }

  const backend = await page.request.get("/api/backend/status");
  expect(backend.ok()).toBeTruthy();
  const status = (await backend.json()) as {
    ok?: boolean;
    database?: { connected?: boolean; driver?: string };
    agent?: { streaming?: boolean };
    localFirst?: { browserCache?: string; wasm?: boolean };
  };
  expect(status.ok).toBe(true);
  expect(status.database?.connected).toBe(true);
  expect(status.database?.driver).toBe("postgres");
  expect(status.agent?.streaming).toBe(true);
  expect(status.localFirst?.browserCache).toBe("IndexedDB");
  expect(status.localFirst?.wasm).toBe(false);
  expect(relevantRuntimeErrors(runtimeErrors)).toEqual([]);

  await page.screenshot({
    path: `artifacts/screenshots/chat-empty-${testInfo.project.name}.png`,
    fullPage: true
  });
});

test("streaming chat creates a compact estimate card and document editor", async ({
  page
}, testInfo) => {
  const runtimeErrors = watchRuntimeErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Учти подготовку, маяки, углы, материалы, логистику и уборку."
  );

  await expect(page.getByText(/Подготовил технологическую карту/)).toBeVisible();
  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("button", { name: /Открыть смету/ })).toBeVisible();
  await card.getByRole("button", { name: /Открыть смету/ }).click();

  const overlay = page.getByTestId("estimate-document-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByLabel("Название сметы")).toHaveValue(
    "Механизированная гипсовая штукатурка — 358 м²"
  );
  const price = overlay.getByLabel("Цена позиции 1");
  await price.fill("650");
  await price.blur();
  await expect(price).toHaveValue("650");

  await overlay.getByRole("button", { name: "Готово", exact: true }).click();
  const preview = page.getByTestId("estimate-revision-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByText(/Версия 2/)).toBeVisible();

  expect(relevantRuntimeErrors(runtimeErrors)).toEqual([]);
  await openMenuIfMobile(page);
  await expect(visibleSidebar(page)).toHaveCount(1);
  await page.screenshot({
    path: `artifacts/screenshots/estimate-${testInfo.project.name}.png`,
    fullPage: true
  });
});

test("reload restores the compact card and opens the saved document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Составь полную смету механизированной штукатурки 120 м² в Казани, слой 10 мм."
  );
  await expect(page.getByTestId("estimate-artifact-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Остановить генерацию" })).toHaveCount(0, {
    timeout: 30_000
  });
  await waitForPersistedEstimateMessage(page);
  await page.reload();
  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: /Открыть смету/ }).click();
  await expect(page.getByTestId("estimate-document-overlay").getByLabel("Название сметы")).toHaveValue(
    "Механизированная гипсовая штукатурка — 120 м²"
  );
});

test("stop button cancels an active streaming run", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Расскажи подробно, как Просметчик составляет профессиональную строительную смету и проверяет технологическую карту."
  );
  const stop = page.getByRole("button", { name: "Остановить генерацию" });
  await expect(stop).toBeVisible();
  await stop.dispatchEvent("click");
  await expect(stop).toHaveCount(0, { timeout: 10_000 });
  await expect(composer(page)).toBeEditable();
});
