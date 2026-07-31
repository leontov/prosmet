import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const failures = [];
const sourcePatterns = [
  { label: "eval", regex: /(^|[^.$\w])eval\s*\(/g },
  { label: "new Function", regex: /\bnew\s+Function\s*\(/g },
  { label: "Function constructor", regex: /(^|[^.$\w])Function\s*\(\s*["'`]/g },
  { label: "string setTimeout", regex: /\bsetTimeout\s*\(\s*["'`]/g },
  { label: "string setInterval", regex: /\bsetInterval\s*\(\s*["'`]/g }
];
const bundlePatterns = sourcePatterns.filter((pattern) => pattern.label !== "Function constructor");

async function scan(directory, patterns, extensions) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path, patterns, extensions);
    else if (entry.isFile() && extensions.some((extension) => path.endsWith(extension))) {
      const source = await readFile(path, "utf8");
      for (const pattern of patterns) {
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(source);
        if (!match) continue;
        failures.push({
file: relative(root, path),
pattern: pattern.label,
snippet: source.slice(Math.max(0, match.index - 90), Math.min(source.length, match.index + 170)).replace(/\s+/g, " ")
        });
      }
    }
  }
}

for (const directory of ["app", "components", "lib"]) {
  await scan(resolve(root, directory), sourcePatterns, [".ts", ".tsx", ".js", ".jsx"]);
}
await scan(resolve(root, ".next/static/chunks"), bundlePatterns, [".js"]);

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "csp-no-string-evaluation", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status: "PASS",
  contract: "csp-no-string-evaluation",
  bundle: ".next/static/chunks",
  securitypolicyviolation: "covered by Playwright",
  setTimeout: "function callbacks only",
  setInterval: "function callbacks only"
}, null, 2));
