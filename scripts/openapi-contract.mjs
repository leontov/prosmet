import { readFile, writeFile } from "node:fs/promises";
import { openApiDocument, routeInventory } from "./openapi-source.mjs";

const serverPath = new URL("../apps/web/server.mjs", import.meta.url);
const outputPath = new URL("../apps/web/public/openapi.json", import.meta.url);
const canonical = `${JSON.stringify(openApiDocument, null, 2)}\n`;
const writeMode = process.argv.includes("--write");

if (writeMode) await writeFile(outputPath, canonical, "utf8");

const [serverSource, committed] = await Promise.all([
  readFile(serverPath, "utf8"),
  readFile(outputPath, "utf8")
]);

const failures = [];
if (committed !== canonical) failures.push("openapi:committed-document-is-not-canonical");
if (openApiDocument.openapi !== "3.1.0") failures.push("openapi:version-must-be-3.1.0");
if (!openApiDocument.components?.schemas?.ApiError) failures.push("openapi:standard-error-schema-missing");

const operations = new Map();
for (const route of routeInventory) {
  const path = openApiDocument.paths?.[route.path];
  const operation = path?.[route.method.toLowerCase()];
  if (!operation) {
    failures.push(`openapi:route-missing:${route.method} ${route.path}`);
    continue;
  }
  if (operation["x-prosmet-scope"] !== route.scope) {
    failures.push(`openapi:scope-mismatch:${route.method} ${route.path}`);
  }
  if (!operation.operationId) {
    failures.push(`openapi:operation-id-missing:${route.method} ${route.path}`);
  } else if (operations.has(operation.operationId)) {
    failures.push(`openapi:duplicate-operation-id:${operation.operationId}`);
  } else {
    operations.set(operation.operationId, `${route.method} ${route.path}`);
  }
  for (const needle of route.serverNeedles) {
    if (!serverSource.includes(needle)) {
      failures.push(`openapi:server-route-not-found:${route.method} ${route.path}:${needle}`);
    }
  }
  for (const status of ["400", "401", "403", "404", "409", "429", "500"]) {
    if (!operation.responses?.[status]) {
      failures.push(`openapi:error-response-missing:${route.method} ${route.path}:${status}`);
    }
  }
  const security = JSON.stringify(operation.security || []);
  if (route.scope === "admin" && (!security.includes("adminCookie") || !security.includes("adminToken"))) {
    failures.push(`openapi:admin-security-missing:${route.method} ${route.path}`);
  }
  if (route.scope === "user" && !security.includes("userCookie")) {
    failures.push(`openapi:user-security-missing:${route.method} ${route.path}`);
  }
}

const specRouteCount = Object.values(openApiDocument.paths || {}).reduce(
  (total, path) => total + Object.keys(path).filter((method) => [
    "get", "post", "put", "patch", "delete", "head", "options"
  ].includes(method)).length,
  0
);
if (specRouteCount !== routeInventory.length) {
  failures.push(`openapi:route-count-mismatch:spec=${specRouteCount}:inventory=${routeInventory.length}`);
}

const agentSchema = JSON.stringify(openApiDocument.components.schemas.AgentDescriptor);
for (const forbidden of ["secretCipher", "apiKey", "adminToken", "passwordHash"]) {
  if (agentSchema.includes(forbidden)) failures.push(`openapi:agent-secret-leak:${forbidden}`);
}

const literalApiPaths = new Set(
  [...serverSource.matchAll(/["'`](\/api\/[A-Za-z0-9_./-]+)["'`]/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes("${"))
);
const documented = new Set(Object.keys(openApiDocument.paths));
documented.add("/api/users/register");
for (const path of literalApiPaths) {
  if (!documented.has(path)) failures.push(`openapi:undocumented-literal-route:${path}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  openapi: openApiDocument.openapi,
  routes: routeInventory.length,
  operations: operations.size,
  output: "apps/web/public/openapi.json"
}, null, 2));
