"use client";

const DB_NAME = "prosmet-local-v1";
const DB_VERSION = 1;
const STORE = "sqlite";
const KEY = "prosmet.sqlite";

let promise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (promise) return promise;
  promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
    request.onblocked = () => reject(new Error("Обновление локальной базы заблокировано другой вкладкой"));
  });
  return promise;
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Ошибка IndexedDB"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Транзакция IndexedDB отменена"));
  });
}

export async function readSqliteFile() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readonly");
  const request = transaction.objectStore(STORE).get(KEY);
  const value = await new Promise<ArrayBuffer | Uint8Array | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ArrayBuffer | Uint8Array | undefined);
    request.onerror = () => reject(request.error ?? new Error("Не удалось прочитать локальную базу"));
  });
  await complete(transaction);
  if (!value) return null;
  return value instanceof Uint8Array ? value.slice() : new Uint8Array(value.slice(0));
}

export async function writeSqliteFile(bytes: Uint8Array) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).put(bytes.slice().buffer, KEY);
  await complete(transaction);
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
