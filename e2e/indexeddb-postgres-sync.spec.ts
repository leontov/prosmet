import { expect, test } from "@playwright/test";

const DB_NAME = "prosmet-cache-v3";
const REQUIRED_STORES = ["threads", "outbox", "syncState"];

async function waitForDatabase(page: import("@playwright/test").Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async ({ databaseName, requiredStores }) => {
          const databases = await indexedDB.databases();
          const metadata = databases.find((database) => database.name === databaseName);
          if (!metadata || Number(metadata.version) < 2) return false;
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
      { timeout: 15_000, message: "Application IndexedDB schema was not ready" }
    )
    .toBe(true);
}

async function readLocalState(
  page: import("@playwright/test").Page,
  threadId: string
) {
  return page.evaluate(
    async ({ databaseName, threadId }) =>
      new Promise<{
        outbox: number;
        cursor: number;
        deviceId: string | null;
        thread: Record<string, unknown> | null;
      }>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onblocked = () => reject(new Error("IndexedDB open was blocked"));
        request.onsuccess = () => {
          const database = request.result;
          try {
            const transaction = database.transaction(
              ["outbox", "syncState", "threads"],
              "readonly"
            );
            const outboxRequest = transaction.objectStore("outbox").count();
            const syncRequest = transaction.objectStore("syncState").get("server");
            const threadRequest = transaction.objectStore("threads").get(threadId);
            transaction.onabort = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB transaction failed"));
            };
            transaction.oncomplete = () => {
              const sync = syncRequest.result as
                | { cursor?: number; deviceId?: string }
                | undefined;
              resolve({
                outbox: outboxRequest.result,
                cursor: Number(sync?.cursor) || 0,
                deviceId: sync?.deviceId ?? null,
                thread: (threadRequest.result as Record<string, unknown> | undefined) ?? null
              });
              database.close();
            };
          } catch (error) {
            database.close();
            reject(error);
          }
        };
      }),
    { databaseName: DB_NAME, threadId }
  );
}

async function seedOutbox(
  page: import("@playwright/test").Page,
  input: {
    threadId: string;
    operationId: string;
    sourceDeviceId: string;
    createdAt: string;
    title: string;
  }
) {
  await page.evaluate(
    async ({ databaseName, input }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onblocked = () => reject(new Error("IndexedDB open was blocked"));
        request.onsuccess = () => {
          const database = request.result;
          try {
            const transaction = database.transaction(
              ["threads", "outbox", "syncState"],
              "readwrite"
            );
            const payload = {
              id: input.threadId,
              title: input.title,
              objectName: "Primary PostgreSQL verification",
              status: "active",
              pinned: false,
              createdAt: input.createdAt,
              updatedAt: input.createdAt
            };
            transaction.objectStore("threads").put(payload);
            transaction.objectStore("outbox").put({
              id: input.operationId,
              entityType: "thread",
              entityId: input.threadId,
              operation: "upsert",
              payload,
              attempts: 0,
              createdAt: input.createdAt,
              lastError: null
            });
            transaction.objectStore("syncState").put({
              scope: "server",
              deviceId: input.sourceDeviceId,
              cursor: 0,
              updatedAt: input.createdAt
            });
            transaction.onabort = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB write aborted"));
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB write failed"));
            };
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          } catch (error) {
            database.close();
            reject(error);
          }
        };
      }),
    { databaseName: DB_NAME, input }
  );
}

async function simulateSecondDevice(
  page: import("@playwright/test").Page,
  input: { threadId: string; pullDeviceId: string; createdAt: string }
) {
  await page.evaluate(
    async ({ databaseName, input }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          try {
            const transaction = database.transaction(
              ["threads", "syncState"],
              "readwrite"
            );
            transaction.objectStore("threads").delete(input.threadId);
            transaction.objectStore("syncState").put({
              scope: "server",
              deviceId: input.pullDeviceId,
              cursor: 0,
              updatedAt: input.createdAt
            });
            transaction.onabort = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB reset aborted"));
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error ?? new Error("IndexedDB reset failed"));
            };
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
          } catch (error) {
            database.close();
            reject(error);
          }
        };
      }),
    { databaseName: DB_NAME, input }
  );
}

test("IndexedDB outbox is committed to PostgreSQL and pulled by another device", async ({
  page
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("crash", () => runtimeErrors.push("Page crashed"));

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const threadId = `e2e-sync-thread-${suffix}`;
  const operationId = `e2e-sync-operation-${suffix}`;
  const sourceDeviceId = `device:e2e-source-${suffix}`;
  const pullDeviceId = `device:e2e-pull-${suffix}`;
  const createdAt = new Date().toISOString();
  const title = `E2E PostgreSQL ${suffix}`;

  await seedOutbox(page, {
    threadId,
    operationId,
    sourceDeviceId,
    createdAt,
    title
  });

  // Reload starts the real application sync loop:
  // IndexedDB outbox -> /api/sync -> PostgreSQL.
  await page.reload();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);

  await expect
    .poll(async () => readLocalState(page, threadId), { timeout: 30_000 })
    .toMatchObject({ outbox: 0 });

  const pushedState = await readLocalState(page, threadId);
  expect(pushedState.cursor).toBeGreaterThan(0);
  expect(pushedState.deviceId).toBe(sourceDeviceId);

  const serverPull = await page.request.get("/api/sync?cursor=0&limit=250");
  expect(serverPull.ok()).toBeTruthy();
  const serverPayload = (await serverPull.json()) as {
    cursor?: number;
    operations?: Array<{
      operationId?: string;
      entityId?: string;
      deviceId?: string;
      entityType?: string;
    }>;
  };
  const persistedOperation = serverPayload.operations?.find(
    (operation) => operation.operationId === operationId
  );
  expect(persistedOperation).toMatchObject({
    entityId: threadId,
    deviceId: sourceDeviceId,
    entityType: "thread"
  });

  await simulateSecondDevice(page, { threadId, pullDeviceId, createdAt });

  await page.reload();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await waitForDatabase(page);

  await expect
    .poll(async () => readLocalState(page, threadId), { timeout: 30_000 })
    .toMatchObject({
      outbox: 0,
      deviceId: pullDeviceId,
      thread: { id: threadId, title }
    });

  const finalState = await readLocalState(page, threadId);
  expect(finalState.cursor).toBeGreaterThanOrEqual(Number(serverPayload.cursor) || 1);
  expect(
    runtimeErrors.filter((message) =>
      /Content Security Policy|unsafe-eval|wasm|sql-wasm|hydration|ZodError|Connection closed|IndexedDB.*not found|Page crashed/i.test(
        message
      )
    )
  ).toEqual([]);
});
