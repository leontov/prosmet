import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createAssistantThreadStore } from "./assistant-thread-store.mjs";

const publicPort = Number(process.env.PORT || 3200);
const upstreamPort = Number(process.env.PROSMET_UPSTREAM_PORT || publicPort + 1);
const host = process.env.PROSMET_HOST || "127.0.0.1";
const upstreamHost = "127.0.0.1";
const store = createAssistantThreadStore();
const maxBodyBytes = 2 * 1024 * 1024;

process.env.PORT = String(upstreamPort);
await import("./server.mjs");

async function readBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request body is too large"), { code: "BODY_TOO_LARGE" });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(data);
}

async function ownerId(request) {
  const cookie = request.headers.cookie || "";
  const upstream = await fetch(`http://${upstreamHost}:${upstreamPort}/api/auth/session`, {
    headers: cookie ? { cookie } : {}
  });
  if (!upstream.ok) return null;
  const session = await upstream.json();
  return typeof session?.user?.id === "string" ? session.user.id : null;
}

async function handleThreadRoute(request, response, url) {
  if (!url.pathname.startsWith("/api/threads")) return false;
  const userId = await ownerId(request);
  if (!userId) {
    sendJson(response, 401, { error: { code: "AUTH_REQUIRED", message: "Войдите в ProSmet для серверной истории чатов." } });
    return true;
  }
  const body = await readBody(request);
  const parts = url.pathname.split("/").filter(Boolean).slice(2);
  const threadId = parts[0] ? decodeURIComponent(parts[0]) : null;
  const messagesRoute = parts[1] === "messages";
  if (request.method === "GET" && !threadId) {
    return sendJson(response, 200, { threads: store.listThreads(userId).map((t) => ({ status: t.status, remoteId: t.id, title: t.title })), persistence: "sqlite" });
  }
  if (request.method === "POST" && !threadId) {
    const input = JSON.parse(body?.toString("utf8") || "{}");
    const thread = store.initialize(input.id, userId, input.title);
    return sendJson(response, 201, { ...thread, remoteId: thread.id });
  }
  if (!threadId) return sendJson(response, 404, { error: { code: "THREAD_NOT_FOUND", message: "Чат не найден" } });
  if (messagesRoute && request.method === "GET") {
    const messages = store.messages(threadId, userId);
    return messages ? sendJson(response, 200, { messages, persistence: "sqlite" }) : sendJson(response, 404, { error: { code: "THREAD_NOT_FOUND", message: "Чат не найден" } });
  }
  if (messagesRoute && request.method === "POST") {
    const input = JSON.parse(body?.toString("utf8") || "{}");
    const message = input.message || {};
    const text = typeof message.content === "string" ? message.content : "";
    const thread = store.appendMessage(threadId, userId, { ...message, title: text.slice(0, 160) });
    return sendJson(response, 200, { ...thread, remoteId: thread.id });
  }
  if (request.method === "GET") {
    const thread = store.getThread(threadId, userId);
    return thread ? sendJson(response, 200, { ...thread, remoteId: thread.id }) : sendJson(response, 404, { error: { code: "THREAD_NOT_FOUND", message: "Чат не найден" } });
  }
  if (request.method === "PATCH") {
    const input = JSON.parse(body?.toString("utf8") || "{}");
    let thread = store.getThread(threadId, userId);
    if (!thread) return sendJson(response, 404, { error: { code: "THREAD_NOT_FOUND", message: "Чат не найден" } });
    if (input.title !== undefined) thread = store.rename(threadId, userId, input.title);
    if (input.status !== undefined) thread = store.setStatus(threadId, userId, input.status);
    return sendJson(response, 200, { ...thread, remoteId: thread.id });
  }
  if (request.method === "DELETE") {
    return sendJson(response, 200, { deleted: store.remove(threadId, userId), remoteId: threadId });
  }
  return sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}

async function proxy(request, response, body) {
  const upstream = await fetch(`http://${upstreamHost}:${upstreamPort}${request.url}`, {
    method: request.method,
    headers: Object.fromEntries(Object.entries(request.headers).filter(([key]) => !["host", "connection"].includes(key))),
    body
  });

  const headers = {};
  upstream.headers.forEach((value, key) => {
    // Node's fetch automatically decodes compressed upstream bodies. Forwarding
    // content-encoding/content-length here makes the browser decode the body a
    // second time and produces ERR_CONTENT_DECODING_FAILED.
    if (["transfer-encoding", "connection", "content-encoding", "content-length"].includes(key)) return;
    headers[key] = value;
  });
  response.writeHead(upstream.status, headers);
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    if (url.pathname.startsWith("/api/threads")) {
      if (await handleThreadRoute(request, response, url)) return;
    }
    await proxy(request, response, await readBody(request));
  } catch (error) {
    if (!response.headersSent) sendJson(response, error?.code === "BODY_TOO_LARGE" ? 413 : 500, { error: { code: error?.code || "SERVER_FAILED", message: error instanceof Error ? error.message : "Request failed" } });
    else if (!response.writableEnded) response.end();
  }
});

server.listen(publicPort, host, () => console.log(`ProSmet edge server listening on http://${host}:${publicPort}`));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    store.close();
    server.close(() => process.exit(0));
  });
}
