import { readFile, writeFile, rm } from "node:fs/promises";

const serverPath = "apps/web/server.mjs";
const storePath = "apps/web/server/estimate-store.mjs";

let server = await readFile(serverPath, "utf8");
const store = await readFile(storePath, "utf8");

if (server.includes("function createEstimateStore(databasePath)")) {
  await rm("scripts/inline-estimate-store.mjs", { force: true });
  console.log("Estimate store already inlined.");
  process.exit(0);
}

server = server.replace('import { createEstimateStore } from "./server/estimate-store.mjs";\n', "");
server = server.replace(
  'import { createInterface } from "node:readline";\n',
  'import { createInterface } from "node:readline";\nimport { mkdirSync } from "node:fs";\nimport { dirname } from "node:path";\nimport { DatabaseSync } from "node:sqlite";\n'
);

const body = store
  .replace('import { mkdirSync } from "node:fs";\n', "")
  .replace('import { dirname } from "node:path";\n', "")
  .replace('import { DatabaseSync } from "node:sqlite";\n', "")
  .replace("export function createEstimateStore", "function createEstimateStore")
  .trim();

server = server.replace(
  'const root = fileURLToPath(new URL("./dist/", import.meta.url));',
  `${body}\n\nconst root = fileURLToPath(new URL("./dist/", import.meta.url));`
);

await writeFile(serverPath, server, "utf8");
await rm("scripts/inline-estimate-store.mjs", { force: true });
console.log("Estimate store inlined into production server.mjs.");
