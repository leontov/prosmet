"use client";

const DB_NAME = "prosmet-cache-v3";
// Version 3 adds immutable Price Intelligence stores while retaining every
// thread, message, estimate, document and price created by earlier versions.
const DB_VERSION = 3;
const OPEN_TIMEOUT_MS = 8_000;

export const LOCAL_STORES = {
  meta: "meta",
  threads: "threads",
  messages: "messages",
  estimates: "estimates",
  estimateRevisions: "estimateRevisions",
  documents: "documents",
  documentRevisions: "documentRevisions",
  prices: "prices",
  canonicalWorks: "canonicalWorks",
  priceObservations: "priceObservations",
  priceHistory: "priceHistory",
  marketPriceBuckets: "marketPriceBuckets",
  priceResearchEvidence: "priceResearchEvidence",
  files: "files",
  outbox: "outbox",
  syncState: "syncState"
} as const;

export type LocalStoreName = (typeof LOCAL_STORES)[keyof typeof LOCAL_STORES];

const REQUIRED_STORES = Object.values(LOCAL_STORES);
let databasePromise: Promise<IDBDatabase> | null = null;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label}: превышено время ожидания ${OPEN_TIMEOUT_MS / 1000} с`)),
      OPEN_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options: IDBIndexParameters = { unique: false }
) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function ensureStore(
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: LocalStoreName,
  options: IDBObjectStoreParameters
) {
  return database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, options);
}

function createSchema(database: IDBDatabase, transaction: IDBTransaction) {
  ensureStore(database, transaction, LOCAL_STORES.meta, { keyPath: "key" });

  const threads = ensureStore(database, transaction, LOCAL_STORES.threads, {
    keyPath: "id"
  });
  ensureIndex(threads, "status", "status");
  ensureIndex(threads, "updatedAt", "updatedAt");
  ensureIndex(threads, "pinnedUpdatedAt", ["pinned", "updatedAt"]);

  const messages = ensureStore(database, transaction, LOCAL_STORES.messages, {
    keyPath: "key"
  });
  ensureIndex(messages, "threadId", "threadId");
  ensureIndex(messages, "threadOrdinal", ["threadId", "ordinal"]);

  const estimates = ensureStore(database, transaction, LOCAL_STORES.estimates, {
    keyPath: "id"
  });
  ensureIndex(estimates, "threadId", "threadId");
  ensureIndex(estimates, "updatedAt", "updatedAt");
  ensureIndex(estimates, "deletedAt", "deletedAt");

  const estimateRevisions = ensureStore(
    database,
    transaction,
    LOCAL_STORES.estimateRevisions,
    { keyPath: "key" }
  );
  ensureIndex(estimateRevisions, "estimateId", "estimateId");

  const documents = ensureStore(database, transaction, LOCAL_STORES.documents, {
    keyPath: "id"
  });
  ensureIndex(documents, "threadId", "threadId");
  ensureIndex(documents, "updatedAt", "updatedAt");

  const documentRevisions = ensureStore(
    database,
    transaction,
    LOCAL_STORES.documentRevisions,
    { keyPath: "key" }
  );
  ensureIndex(documentRevisions, "documentId", "documentId");

  const prices = ensureStore(database, transaction, LOCAL_STORES.prices, {
    keyPath: "id"
  });
  ensureIndex(prices, "lookup", ["normalizedName", "unit"]);
  ensureIndex(prices, "updatedAt", "updatedAt");

  const canonicalWorks = ensureStore(database, transaction, LOCAL_STORES.canonicalWorks, {
    keyPath: "id"
  });
  ensureIndex(canonicalWorks, "canonicalName", "canonicalName");
  ensureIndex(canonicalWorks, "category", "category");
  ensureIndex(canonicalWorks, "active", "active");

  const priceObservations = ensureStore(
    database,
    transaction,
    LOCAL_STORES.priceObservations,
    { keyPath: "id" }
  );
  ensureIndex(priceObservations, "workUnit", ["canonicalWorkId", "unit"]);
  ensureIndex(priceObservations, "workRegion", ["canonicalWorkId", "region"]);
  ensureIndex(priceObservations, "estimateItem", ["estimateId", "estimateItemId"]);
  ensureIndex(priceObservations, "status", "status");
  ensureIndex(priceObservations, "observedAt", "observedAt");

  const priceHistory = ensureStore(database, transaction, LOCAL_STORES.priceHistory, {
    keyPath: "id"
  });
  ensureIndex(priceHistory, "estimateItem", ["estimateId", "estimateItemId"]);
  ensureIndex(priceHistory, "canonicalWorkId", "canonicalWorkId");
  ensureIndex(priceHistory, "changedAt", "changedAt");

  const marketPriceBuckets = ensureStore(
    database,
    transaction,
    LOCAL_STORES.marketPriceBuckets,
    { keyPath: "id" }
  );
  ensureIndex(marketPriceBuckets, "workRegion", ["canonicalWorkId", "region"]);
  ensureIndex(marketPriceBuckets, "timeBucket", "timeBucket");
  ensureIndex(marketPriceBuckets, "updatedAt", "updatedAt");

  const priceResearchEvidence = ensureStore(
    database,
    transaction,
    LOCAL_STORES.priceResearchEvidence,
    { keyPath: "id" }
  );
  ensureIndex(priceResearchEvidence, "canonicalWorkId", "canonicalWorkId");
  ensureIndex(priceResearchEvidence, "region", "region");
  ensureIndex(priceResearchEvidence, "observedAt", "observedAt");

  const files = ensureStore(database, transaction, LOCAL_STORES.files, {
    keyPath: "id"
  });
  ensureIndex(files, "threadId", "threadId");
  ensureIndex(files, "updatedAt", "updatedAt");

  const outbox = ensureStore(database, transaction, LOCAL_STORES.outbox, {
    keyPath: "id"
  });
  ensureIndex(outbox, "createdAt", "createdAt");

  ensureStore(database, transaction, LOCAL_STORES.syncState, { keyPath: "scope" });
}

function missingStores(database: IDBDatabase) {
  return REQUIRED_STORES.filter((name) => !database.objectStoreNames.contains(name));
}

export function openLocalDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = withTimeout(
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const transaction = request.transaction;
        if (!transaction) {
          reject(new Error("Не удалось запустить миграцию локального IndexedDB-кэша"));
          return;
        }
        createSchema(request.result, transaction);
      };
      request.onsuccess = () => {
        const database = request.result;
        const missing = missingStores(database);
        if (missing.length > 0) {
          database.close();
          databasePromise = null;
          reject(
            new Error(
              `Схема локального IndexedDB-кэша неполная: отсутствуют ${missing.join(", ")}`
            )
          );
          return;
        }
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error("Не удалось открыть локальный IndexedDB-кэш"));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(
          new Error(
            "Обновление IndexedDB-кэша заблокировано другой вкладкой. Закройте старую вкладку и обновите страницу."
          )
        );
      };
    }),
    "Открытие локального кэша"
  ).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ошибка запроса IndexedDB"));
  });
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Ошибка транзакции IndexedDB"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Транзакция IndexedDB отменена"));
  });
}

export async function withLocalTransaction<T>(
  stores: LocalStoreName | readonly LocalStoreName[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T> | T
): Promise<T> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(
    Array.isArray(stores) ? [...stores] : stores,
    mode
  );
  const done = transactionDone(transaction);
  try {
    const value = await operation(transaction);
    await done;
    return value;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // Preserve the original error.
    }
    throw error;
  }
}

export async function getRecord<T>(store: LocalStoreName, key: IDBValidKey) {
  return withLocalTransaction(store, "readonly", (transaction) =>
    requestResult<T | undefined>(transaction.objectStore(store).get(key))
  );
}

export async function getAllRecords<T>(store: LocalStoreName) {
  return withLocalTransaction(store, "readonly", (transaction) =>
    requestResult<T[]>(transaction.objectStore(store).getAll())
  );
}

export async function getAllByIndex<T>(
  store: LocalStoreName,
  index: string,
  query?: IDBValidKey | IDBKeyRange | null
) {
  return withLocalTransaction(store, "readonly", (transaction) =>
    requestResult<T[]>(transaction.objectStore(store).index(index).getAll(query ?? null))
  );
}

export async function putRecord<T>(store: LocalStoreName, value: T) {
  return withLocalTransaction(store, "readwrite", (transaction) =>
    requestResult(transaction.objectStore(store).put(value))
  );
}

export async function deleteRecord(store: LocalStoreName, key: IDBValidKey) {
  return withLocalTransaction(store, "readwrite", (transaction) =>
    requestResult(transaction.objectStore(store).delete(key))
  );
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  } catch {
    return false;
  }
}
