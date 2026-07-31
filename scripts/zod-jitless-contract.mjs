import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const wrapperPath = resolve(root, "lib/zod.ts");
const wrapper = await readFile(wrapperPath, "utf8");
const failures = [];

if (!wrapper.includes("z.config({ jitless: true })")) failures.push("lib/zod.ts:missing:jitless");
if (wrapper.indexOf("z.config({ jitless: true })") > wrapper.indexOf("export { z }")) failures.push("lib/zod.ts:config-must-precede-export");

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.tsx?$/.test(path) && resolve(path) !== wrapperPath) {
      const source = await readFile(path, "utf8");
      if (/from\s+["']zod["']/.test(source) || /require\(\s*["']zod["']\s*\)/.test(source)) {
        failures.push(`${relative(root, path)}:direct-zod-import`);
      }
    }
  }
}

for (const directory of ["app", "components", "lib"]) await walk(resolve(root, directory));

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "zod-jitless", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", contract: "zod-jitless", wrapper: "lib/zod.ts" }, null, 2));
