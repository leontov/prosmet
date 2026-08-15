import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantThreadStore } from "../apps/web/assistant-thread-store.mjs";

async function createStore() {
  const directory = await mkdtemp(join(tmpdir(), "prosmet-thread-store-"));
  return createAssistantThreadStore(join(directory, "threads.sqlite"));
}

test("assistant thread store persists CRUD and isolates owners", async () => {
  const store = await createStore();
  try {
    const first = store.initialize("thread-1", "user-a", "Новый чат");
    assert.equal(first?.id, "thread-1");
    assert.equal(first?.ownerId, "user-a");

    const second = store.initialize("thread-2", "user-b", "Другой чат");
    assert.equal(second?.ownerId, "user-b");

    const message = {
      id: "message-1",
      parent_id: null,
      format: "json",
      content: { role: "user", content: [{ type: "text", text: "Составь смету" }] },
      title: "Составь смету на дом"
    };
    const appended = store.appendMessage("thread-1", "user-a", message);
    assert.equal(appended?.title, "Составь смету на дом");

    const messages = store.messages("thread-1", "user-a");
    assert.equal(messages?.length, 1);
    assert.deepEqual(messages?.[0]?.content, message.content);

    store.appendMessage("thread-1", "user-a", message);
    assert.equal(store.messages("thread-1", "user-a")?.length, 1);

    assert.equal(store.getThread("thread-1", "user-b"), null);
    assert.equal(store.messages("thread-1", "user-b"), null);
    assert.equal(store.rename("thread-1", "user-b", "Hijack"), null);
    assert.equal(store.setStatus("thread-1", "user-b", "archived"), null);
    assert.equal(store.remove("thread-1", "user-b"), false);

    const renamed = store.rename("thread-1", "user-a", "Смета дома");
    assert.equal(renamed?.title, "Смета дома");

    const archived = store.setStatus("thread-1", "user-a", "archived");
    assert.equal(archived?.status, "archived");
    assert.deepEqual(store.listThreads("user-a").map((thread) => thread.id), ["thread-1"]);
    assert.deepEqual(store.listThreads("user-b").map((thread) => thread.id), ["thread-2"]);

    assert.equal(store.remove("thread-1", "user-a"), true);
    assert.equal(store.getThread("thread-1", "user-a"), null);
    assert.equal(store.messages("thread-1", "user-a"), null);
  } finally {
    store.close();
  }
});
