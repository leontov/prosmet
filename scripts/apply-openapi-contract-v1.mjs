import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one replacement target, found ${count}`);
  await writeFile(path, source.replace(before, after), "utf8");
}

await replaceOnce(
  "apps/web/server.mjs",
  "async function handleApi(request, response, url) {\n  if (request.method === \"GET\" && url.pathname === \"/api/health\") {",
  `async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/openapi.json") {
    const document = JSON.parse(await readFile(join(root, "openapi.json"), "utf8"));
    return sendJson(response, 200, document, {
      "cache-control": "public, max-age=300"
    });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {`
);

const packagePath = "package.json";
const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.scripts["openapi:check"] = "node scripts/openapi-contract.mjs";
packageJson.scripts.verify = "node scripts/openapi-contract.mjs && node scripts/greenfield-contract.mjs && node scripts/assistant-ui-style-contract.mjs && npm run typecheck && npm run test && npm run build";
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  '  "apps/web/server.mjs",',
  `  "apps/web/server.mjs",
  "apps/web/public/openapi.json",
  "apps/web/e2e/openapi.spec.ts",
  "scripts/openapi-source.mjs",
  "scripts/openapi-contract.mjs",
  "docs/architecture/desktop-web-api-contract.md",`
);

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  'const server = await read("apps/web/server.mjs");',
  `const server = await read("apps/web/server.mjs");
const openApiContract = await read("scripts/openapi-contract.mjs");
const openApiSource = await read("scripts/openapi-source.mjs");`
);

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  'if (!server.includes("content-encoding") || !server.includes("brotliCompressSync")) failures.push("server:static-compression-missing");',
  `if (!server.includes("content-encoding") || !server.includes("brotliCompressSync")) failures.push("server:static-compression-missing");
for (const token of [
  'url.pathname === "/api/openapi.json"',
  'join(root, "openapi.json")',
  '"cache-control": "public, max-age=300"'
]) {
  if (!server.includes(token)) failures.push(\`openapi:server-publishing-missing:\${token}\`);
}
for (const token of ["routeInventory", "committed-document-is-not-canonical", "agent-secret-leak"]) {
  if (!openApiContract.includes(token)) failures.push(\`openapi:contract-gate-missing:\${token}\`);
}
if (!openApiSource.includes('openapi: "3.1.0"')) failures.push("openapi:source-version-missing");`
);
