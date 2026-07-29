import { expect, test, type Browser, type Page } from "@playwright/test";

const DB_NAME = "prosmet-cache-v3";
const REQUIRED_STORES = ["priceObservations", "outbox", "syncState"];

async function waitForDatabase(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async ({ databaseName, requiredStores }) => {
          const databases = await indexedDB.databases();
          const metadata = databases.find((database) => database.name === databaseName);
          if (!metadata || Number(metadata.version) < 3) return false;
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
        }, { databaseName: DB_NAME, requiredStores: REQUIRED_STORES }),
      { timeout: 15_000, message: "Price Intelligence IndexedDB stores were not ready" }
    )
    .toBe(true);
}

async function readState(page: Page, observationId: string) {
  return page.evaluate(
    async ({ databaseName, observationId }) =>
      new Promise<{
        outbox: number;
        cursor: number;
        deviceId: string | null;
        observation: Record<string, unknown> | null;
      }>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["priceObservations", "outbox", "syncState"],
            "readonly"
          );
          const observation = transaction.objectStore("priceObservations").get(observationId);
          const outbox = transaction.objectStore("outbox").count();
          const sync = transaction.objectStore("syncState").get("server");
          transaction.oncomplete = () => {
            const identity = sync.result as { cursor?: number; deviceId?: string } | undefined;
            resolve({
              outbox: outbox.result,
              cursor: Number(identity?.cursor) || 0,
              deviceId: identity?.deviceId ?? null,
              observation:
                (observation.result as Record<string, unknown> | undefined) ?? null
            });
            database.close();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error ?? new Error("IndexedDB read failed"));
          };
        };
      }),
    { databaseName: DB_NAME, observationId }
  );
}

async function waitForDeviceId(page: Page) {
  await expect
    .poll(async () => (await readState(page, "__probe__")).deviceId, {
      timeout: 15_000,
      message: "Application did not create a persistent device identity"
    })
    .toMatch(/^device:/);
  return (await readState(page, "__probe__")).deviceId as string;
}

async function seedObservation(
  page: Page,
  input: {
    operationId: string;
    observationId: string;
    timestamp: string;
  }
) {
  await page.evaluate(
    async ({ databaseName, input }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["priceObservations", "outbox"],
            "readwrite"
          );
          const payload = {
            id: input.observationId,
            entityKind: "price_observation",
            canonicalWorkId: "work_mechanized_gypsum_plaster",
            rawName: "Механизированная гипсовая штукатурка",
            code: "",
            price: 735,
            currency: "RUB",
            unit: "м²",
            region: "Лениногорск",
            sourceType: "personal",
            sourceLabel: "Цена, отправленная клиенту",
            estimateId: "estimate_e2e_price_sync",
            estimateRevision: 4,
            estimateItemId: "item_e2e_price_sync",
            observedAt: input.timestamp,
            context: {
              materialsIncluded: false,
              deliveryIncluded: false,
              equipmentIncluded: false,
              vatIncluded: false,
              layerThicknessMm: 15,
              constrainedConditions: false,
              qualityLevel: "standard",
              urgency: "normal",
              season: "summer"
            },
            contextHash: "ctx_e2e_price_sync",
            confidence: 100,
            status: "sent_to_client",
            changedBy: "user",
            changeReason: "E2E relay verification",
            createdAt: input.timestamp
          };
          transaction.objectStore("priceObservations").put(payload);
          transaction.objectStore("outbox").put({
            id: input.operationId,
            entityType: "price",
            entityId: input.observationId,
            operation: "upsert",
            payload,
            attempts: 0,
            createdAt: input.timestamp,
            lastError: null
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error ?? new Error("IndexedDB write failed"));
          };
        };
      }),
    { databaseName: DB_NAME, input }
  );
}

async function openSecondDevice(browser: Browser, firstPage: Page) {
  const origin = new URL(firstPage.url()).origin;
  const cookies = await firstPage.context().cookies();
  const context = await browser.newContext({ baseURL: origin });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);
  return { context, page };
}

test("immutable price observation is pushed to PostgreSQL and restored on another device", async ({
  page,
  browser
}, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("crash", () => errors.push("Page crashed"));

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);
  const firstDeviceId = await waitForDeviceId(page);

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const observationId = `price_observation:e2e:${suffix}`;
  const operationId = `price_sync_operation:${suffix}`;
  const timestamp = new Date().toISOString();
  await seedObservation(page, { operationId, observationId, timestamp });

  await page.reload();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);
  await expect
    .poll(async () => readState(page, observationId), { timeout: 30_000 })
    .toMatchObject({ outbox: 0, deviceId: firstDeviceId });

  const serverPull = await page.request.get("/api/sync?cursor=0&limit=250");
  expect(serverPull.ok()).toBeTruthy();
  const serverPayload = (await serverPull.json()) as {
    operations?: Array<{
      operationId?: string;
      entityId?: string;
      entityType?: string;
      payload?: { entityKind?: string };
    }>;
  };
  expect(
    serverPayload.operations?.find((operation) => operation.operationId === operationId)
  ).toMatchObject({
    entityId: observationId,
    entityType: "price",
    payload: { entityKind: "price_observation" }
  });

  const second = await openSecondDevice(browser, page);
  try {
    const secondDeviceId = await waitForDeviceId(second.page);
    expect(secondDeviceId).not.toBe(firstDeviceId);
    await expect
      .poll(async () => readState(second.page, observationId), { timeout: 30_000 })
      .toMatchObject({
        outbox: 0,
        deviceId: secondDeviceId,
        observation: {
          id: observationId,
          entityKind: "price_observation",
          price: 735,
          unit: "м²",
          region: "Лениногорск",
          status: "sent_to_client"
        }
      });
  } finally {
    await second.context.close();
  }

  expect(
    errors.filter((message) =>
      /Content Security Policy|unsafe-eval|wasm|sql-wasm|hydration|ZodError|Connection closed|IndexedDB.*not found|Page crashed/i.test(
        message
      )
    )
  ).toEqual([]);
});
