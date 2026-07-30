import {
  A2A_PROTOCOL_VERSION,
  prosmetDeveloperAgentCard,
  publicDeveloperRegistry
} from "@/lib/server/a2a/registry";
import {
  cancelDeveloperTask,
  createDeveloperTask,
  getDeveloperTask,
  listDeveloperTasks
} from "@/lib/server/a2a/task-store";
import { resolveServerIdentity } from "@/lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 128 * 1024;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function responseHeaders(setCookie: string | null) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  if (setCookie) headers.set("set-cookie", setCookie);
  return headers;
}

function rpcResult(id: JsonRpcId, result: unknown, setCookie: string | null) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: responseHeaders(setCookie)
  });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  setCookie: string | null,
  status = 400,
  data?: unknown
) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) }
    }),
    { status, headers: responseHeaders(setCookie) }
  );
}

function taskId(params: Record<string, unknown>) {
  const value = params.id ?? params.taskId;
  return typeof value === "string" ? value.trim() : "";
}

function messageText(params: Record<string, unknown>) {
  const message = record(params.message);
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .flatMap((part) => {
      const value = record(part);
      if ((value.kind === "text" || value.type === "text") && typeof value.text === "string") {
        return [value.text];
      }
      return [];
    })
    .join("\n")
    .trim();
}

function messageContextId(params: Record<string, unknown>) {
  const message = record(params.message);
  const value = message.contextId ?? params.contextId;
  return typeof value === "string" ? value.trim() : undefined;
}

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  const origin = new URL(request.url).origin;
  const tasks = listDeveloperTasks(identity.ownerId);
  return new Response(
    JSON.stringify({
      ok: true,
      protocolVersion: A2A_PROTOCOL_VERSION,
      agentCard: prosmetDeveloperAgentCard(origin),
      ...publicDeveloperRegistry(),
      taskCount: tasks.length,
      recentTasks: tasks.slice(0, 10)
    }),
    { status: 200, headers: responseHeaders(identity.setCookie) }
  );
}

export async function POST(request: Request) {
  const identity = resolveServerIdentity(request);
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
    return rpcError(null, -32010, "A2A request is too large", identity.setCookie, 413);
  }

  let body: JsonRpcRequest;
  try {
    body = JSON.parse(raw) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error", identity.setCookie);
  }

  const id = body.id ?? null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(id, -32600, "Invalid Request", identity.setCookie);
  }
  const params = record(body.params);

  if (body.method === "message/send") {
    const prompt = messageText(params);
    if (!prompt) {
      return rpcError(id, -32602, "message.parts must contain text", identity.setCookie);
    }
    const task = createDeveloperTask({
      ownerId: identity.ownerId,
      prompt,
      contextId: messageContextId(params)
    });
    return rpcResult(id, task, identity.setCookie);
  }

  if (body.method === "tasks/get") {
    const idValue = taskId(params);
    if (!idValue) return rpcError(id, -32602, "Task id is required", identity.setCookie);
    const task = getDeveloperTask(identity.ownerId, idValue);
    if (!task) return rpcError(id, -32001, "Task not found", identity.setCookie, 404);
    return rpcResult(id, task, identity.setCookie);
  }

  if (body.method === "tasks/cancel") {
    const idValue = taskId(params);
    if (!idValue) return rpcError(id, -32602, "Task id is required", identity.setCookie);
    const task = cancelDeveloperTask(identity.ownerId, idValue);
    if (!task) return rpcError(id, -32001, "Task not found", identity.setCookie, 404);
    return rpcResult(id, task, identity.setCookie);
  }

  if (body.method === "tasks/list") {
    return rpcResult(id, { tasks: listDeveloperTasks(identity.ownerId) }, identity.setCookie);
  }

  return rpcError(id, -32601, "Method not found", identity.setCookie, 404, {
    supportedMethods: ["message/send", "tasks/get", "tasks/cancel", "tasks/list"]
  });
}
