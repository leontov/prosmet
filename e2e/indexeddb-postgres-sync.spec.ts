import { expect, test } from "@playwright/test";

const DB_NAME = "prosmet-cache-v3";

async function openDatabase(page: import("@playwright/test").Page) {
  await page.evaluate(async (databaseName) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }, DB_NAME);
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
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["outbox", "syncState", "threads"],
            "readonly"
          );
          const outboxRequest = transaction.objectStore("outbox").count();
          const syncRequest = transaction.objectStore("syncState").get("server");
          const threadRequest = transaction.objectStore("threads").get(threadId);
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("IndexedDB transaction failed"));
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
        };
      }),
    { databaseName: DB_NAME, threadId }
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

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await openDatabase(page);

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const threadId = `e2e-sync-thread-${suffix}`;
  const operationId = `e2e-sync-operation-${suffix}`;
  const sourceDeviceId = `device:e2e-source-${suffix}`;
  const pullDeviceId = `device:e2e-pull-${suffix}`;
  const createdAt = new Date().toISOString();
  const title = `E2E PostgreSQL ${suffix}`;

  await page.evaluate(
    async ({ databaseName, threadId, operationId, sourceDeviceId, createdAt, title }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["threads", "outbox", "syncState"],
            "readwrite"
          );
          transaction.objectStore("threads").put({
            id: threadId,
            title,
            objectName: "Primary PostgreSQL verification",
            status: "active",
            pinned: false,
            createdAt,
            updatedAt: createdAt
          });
          transaction.objectStore("outbox").put({
            id: operationId,
            entityType: "thread",
            entityId: threadId,
            operation: "upsert",
            payload: {
              id: threadId,
              title,
              objectName: "Primary PostgreSQL verification",
              status: "active",
              pinned: false,
              createdAt,
              updatedAt: createdAt
            },
            attempts: 0,
            createdAt,
            lastError: null
          });
          transaction.objectStore("syncState").put({
            scope: "server",
            deviceId: sourceDeviceId,
            cursor: 0,
            updatedAt: createdAt
          });
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("IndexedDB write failed"));
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    {
      databaseName: DB_NAME,
      threadId,
      operationId,
      sourceDeviceId,
      createdAt,
      title
    }
  );

  // Reload starts the application's real sync loop: IndexedDB outbox -> /api/sync -> PostgreSQL.
  await page.reload();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

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

  // Simulate a second device: remove local materialization, reset cursor and use another device ID.
  await page.evaluate(
    async ({ databaseName, threadId, pullDeviceId, createdAt }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["threads", "syncState"],
            "readwrite"
          );
          transaction.objectStore("threads").delete(threadId);
          transaction.objectStore("syncState").put({
            scope: "server",
            deviceId: pullDeviceId,
            cursor: 0,
            updatedAt: createdAt
          });
          transaction.onerror = () =>
            reject(transaction.error ?? new Error("IndexedDB reset failed"));
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    { databaseName: DB_NAME, threadId, pullDeviceId, createdAt }
  );

  await page.reload();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

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
      /Content Security Policy|unsafe-eval|wasm|sql-wasm|hydration|ZodError|Connection closed/i.test(
        message
      )
    )
  ).toEqual([]);
});
