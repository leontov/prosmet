import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const publicDir = resolve(root, "public");
await mkdir(publicDir, { recursive: true });
await copyFile(source, resolve(publicDir, "sql-wasm.wasm"));
console.log("Copied sql-wasm.wasm to public/");
