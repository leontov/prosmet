"use client";

const DB_NAME = "prosmet-cache-v3";
const DB_VERSION = 1;
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
  files: "files",
  outbox: "outbox",
  syncState: "syncState"
} as const;

export type LocalStoreName = (typeof LOCAL_STORES)[keyof typeof LOCAL_STORES];

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

function createSchema(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(LOCAL_STORES.meta)) {
    database.createObjectStore(LOCAL_STORES.meta, { keyPath: "key" });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.threads)) {
    const store = database.createObjectStore(LOCAL_STORES.threads, { keyPath: "id" });
    store.createIndex("status", "status", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
    store.createIndex("pinnedUpdatedAt", ["pinned", "updatedAt"], { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.messages)) {
    const store = database.createObjectStore(LOCAL_STORES.messages, { keyPath: "key" });
    store.createIndex("threadId", "threadId", { unique: false });
    store.createIndex("threadOrdinal", ["threadId", "ordinal"], { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.estimates)) {
    const store = database.createObjectStore(LOCAL_STORES.estimates, { keyPath: "id" });
    store.createIndex("threadId", "threadId", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.estimateRevisions)) {
    const store = database.createObjectStore(LOCAL_STORES.estimateRevisions, { keyPath: "key" });
    store.createIndex("estimateId", "estimateId", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.documents)) {
    const store = database.createObjectStore(LOCAL_STORES.documents, { keyPath: "id" });
    store.createIndex("threadId", "threadId", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.documentRevisions)) {
    const store = database.createObjectStore(LOCAL_STORES.documentRevisions, { keyPath: "key" });
    store.createIndex("documentId", "documentId", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.prices)) {
    const store = database.createObjectStore(LOCAL_STORES.prices, { keyPath: "id" });
    store.createIndex("lookup", ["normalizedName", "unit"], { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.files)) {
    const store = database.createObjectStore(LOCAL_STORES.files, { keyPath: "id" });
    store.createIndex("threadId", "threadId", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.outbox)) {
    const store = database.createObjectStore(LOCAL_STORES.outbox, { keyPath: "id" });
    store.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(LOCAL_STORES.syncState)) {
    database.createObjectStore(LOCAL_STORES.syncState, { keyPath: "scope" });
  }
}

export function openLocalDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = withTimeout(
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => createSchema(request.result);
      request.onsuccess = () => {
        const database = request.result;
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
            "Локальный IndexedDB-кэш заблокирован другой вкладкой. Закройте старую вкладку и обновите страницу."
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
