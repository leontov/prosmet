"use client";

const DB_NAME = "prosmet-local-v2";
const DB_VERSION = 1;
const STORE = "sqlite";
const KEY = "prosmet.sqlite";
const OPEN_TIMEOUT_MS = 8_000;

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

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = withTimeout(
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };

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
        reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
      };

      request.onblocked = () => {
        databasePromise = null;
        reject(new Error("Локальная база заблокирована другой вкладкой. Закройте старую вкладку и обновите страницу."));
      };
    }),
    "Открытие локальной базы"
  ).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Ошибка транзакции IndexedDB"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Транзакция IndexedDB отменена"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ошибка запроса IndexedDB"));
  });
}

export async function readSqliteFile() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(STORE).get(KEY);
  const value = await requestResult<ArrayBuffer | Uint8Array | undefined>(request);
  await done;

  if (!value) return null;
  return value instanceof Uint8Array ? value.slice() : new Uint8Array(value.slice(0));
}

export async function writeSqliteFile(bytes: Uint8Array) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(STORE).put(bytes.slice().buffer, KEY);
  await requestResult(request);
  await done;
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
