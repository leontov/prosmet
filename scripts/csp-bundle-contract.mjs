import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd(), ".next/static/chunks");
const offenders = [];
const patterns = [
  { label: "eval", regex: /(^|[^.$\w])eval\s*\(/g },
  { label: "new Function", regex: /new\s+Function\s*\(/g },
  { label: "Function constructor", regex: /(^|[^.$\w])Function\s*\(\s*["'`]/g },
  { label: "string setTimeout", regex: /setTimeout\s*\(\s*["'`]/g },
  { label: "string setInterval", regex: /setInterval\s*\(\s*["'`]/g }
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.isFile() || !path.endsWith(".js")) continue;

    const source = await readFile(path, "utf8");
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(source);
      if (!match) continue;
      const start = Math.max(0, match.index - 100);
      const end = Math.min(source.length, match.index + 190);
      offenders.push({
        file: relative(process.cwd(), path),
        pattern: pattern.label,
        snippet: source.slice(start, end).replace(/\s+/g, " ")
      });
    }
  }
}

await walk(root);
if (offenders.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "csp-no-string-evaluation", offenders }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "csp-no-string-evaluation",
  directory: relative(process.cwd(), root),
  securitypolicyviolation: "covered by Playwright",
  setTimeout: "function callbacks only",
  setInterval: "function callbacks only"
}, null, 2));
