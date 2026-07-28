import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "node_modules/sql.js/dist");
const publicDir = resolve(root, "public");
await mkdir(publicDir, { recursive: true });

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const standardSource = resolve(distDir, "sql-wasm.wasm");
const browserSource = resolve(distDir, "sql-wasm-browser.wasm");

if (!(await exists(standardSource))) {
  throw new Error(`Missing SQL.js WASM binary: ${standardSource}`);
}

await copyFile(standardSource, resolve(publicDir, "sql-wasm.wasm"));
await copyFile(
  (await exists(browserSource)) ? browserSource : standardSource,
  resolve(publicDir, "sql-wasm-browser.wasm")
);

console.log("Copied SQL.js WASM assets to public/sql-wasm.wasm and public/sql-wasm-browser.wasm");
