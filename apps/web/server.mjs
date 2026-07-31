import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateAgent,
  AgentServiceError,
  invokeConfiguredAgent,
  listAdminAgents,
  listPublicAgents,
  removeAgent,
  saveAgent,
  testAgent
} from "./server/agent-service.mjs";
import { adminTokenConfigured, agentConfigurationPath, verifyAdminToken } from "./server/agent-config.mjs";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3200);
const releaseSha = process.env.PROSMET_RELEASE_SHA || "development";
const maxBodyBytes = 2 * 1024 * 1024;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, body) {
  if (response.writableEnded) return;
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  const status = error instanceof AgentServiceError ? error.status : 500;
  const code = error instanceof AgentServiceError ? error.code : "internal_error";
  const message = error instanceof Error ? error.message : "Internal server error";
  const details = error instanceof AgentServiceError ? error.details : null;
  if (status >= 500) console.error(`[${code}]`, message, details || "");
  sendJson(response, status, { error: { code, message, ...(details ? { details } : {}) } });
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new AgentServiceError("request_too_large", "Request body is too large", 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new AgentServiceError("invalid_json", "Request body must be valid JSON", 400); }
}

function bearerToken(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function requireAdmin(request) {
  if (!adminTokenConfigured()) {
    throw new AgentServiceError(
      "admin_not_configured",
      "PROSMET_ADMIN_TOKEN is not configured on the server; agent configuration is read-only",
      503
    );
  }
  if (!verifyAdminToken(bearerToken(request))) {
    throw new AgentServiceError("admin_unauthorized", "A valid super-administrator token is required", 401);
  }
}

function routeAgentId(pathname, suffix = "") {
  const pattern = suffix
    ? new RegExp(`^/api/admin/agents/([^/]+)/${suffix}$`)
    : /^\/api\/admin\/agents\/([^/]+)$/;
  const match = pathname.match(pattern);
  return match ? decodeURIComponent(match[1]) : "";
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    let agents;
    try {
      const publicAgents = await listPublicAgents();
      agents = {
        configured: publicAgents.configured,
        enabled: publicAgents.agents.length,
        defaultAgentId: publicAgents.defaultAgentId
      };
    } catch (error) {
      agents = { configured: false, enabled: 0, defaultAgentId: "", error: error instanceof Error ? error.message : "unknown" };
    }
    sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      runtime: "node-static-plus-agent-router",
      ui: "greenfield",
      agents
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/identity") {
    sendJson(response, 200, {
      authenticated: false,
      role: "anonymous",
      superAdminConfigured: adminTokenConfigured(),
      agentConfiguration: adminTokenConfigured() ? "protected" : "read-only"
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
    sendJson(response, 200, await listPublicAgents());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/agent") {
    const body = await readBody(request);
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new AgentServiceError("messages_required", "At least one message is required", 400);
    }
    if (body.messages.length > 100) throw new AgentServiceError("message_limit", "A request may contain at most 100 messages", 400);

    const controller = new AbortController();
    const abort = () => controller.abort(new Error("Client disconnected"));
    request.once("aborted", abort);
    response.once("close", () => { if (!response.writableEnded) abort(); });
    try {
      const result = await invokeConfiguredAgent({
        agentId: typeof body.agentId === "string" ? body.agentId : "",
        messages: body.messages,
        signal: controller.signal
      });
      sendJson(response, 200, result);
    } finally {
      request.removeListener("aborted", abort);
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/agents") {
    requireAdmin(request);
    sendJson(response, 200, { ...(await listAdminAgents()), configPath: agentConfigurationPath() });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/agents") {
    requireAdmin(request);
    sendJson(response, 201, await saveAgent(await readBody(request)));
    return true;
  }

  const agentId = routeAgentId(url.pathname);
  if (agentId && request.method === "PUT") {
    requireAdmin(request);
    sendJson(response, 200, await saveAgent({ ...(await readBody(request)), id: agentId }));
    return true;
  }
  if (agentId && request.method === "DELETE") {
    requireAdmin(request);
    sendJson(response, 200, await removeAgent(agentId));
    return true;
  }

  const activateId = routeAgentId(url.pathname, "activate");
  if (activateId && request.method === "POST") {
    requireAdmin(request);
    sendJson(response, 200, await activateAgent(activateId));
    return true;
  }

  const testId = routeAgentId(url.pathname, "test");
  if (testId && request.method === "POST") {
    requireAdmin(request);
    const controller = new AbortController();
    const abort = () => controller.abort(new Error("Client disconnected"));
    request.once("aborted", abort);
    response.once("close", () => { if (!response.writableEnded) abort(); });
    try {
      sendJson(response, 200, await testAgent(testId, controller.signal));
    } finally {
      request.removeListener("aborted", abort);
    }
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    throw new AgentServiceError("not_found", "API route not found", 404);
  }
  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (await handleApi(request, response, url)) return;
  } catch (error) {
    if (error?.name === "AbortError" || response.destroyed) return;
    return sendError(response, error);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    return response.end();
  }

  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let filePath = join(root, relative || "index.html");
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    return response.end();
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(root, "index.html");
  }

  try {
    const content = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "content-type": mime[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    });
    if (request.method === "HEAD") return response.end();
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prosmet Greenfield listening on http://127.0.0.1:${port}`);
});
