import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";

const port = 4193;
const origin = `http://127.0.0.1:${port}`;
const outputDirectory = join(process.cwd(), "apps/web/lighthouse");
const configDirectory = join(tmpdir(), `prosmet-lighthouse-${process.pid}`);
const serverOutput = [];

await rm(outputDirectory, { recursive: true, force: true });
await rm(configDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(configDirectory, { recursive: true });

const server = spawn(process.execPath, ["apps/web/server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    PROSMET_CONFIG_DIR: configDirectory,
    PROSMET_ADMIN_TOKEN: "lighthouse-admin",
    PROSMET_RELEASE_SHA: "lighthouse"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`ProSmet did not start for Lighthouse:\n${serverOutput.join("")}`);
}

let chrome;
try {
  await waitForHealth();
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const result = await lighthouse(`${origin}/landing`, {
    port: chrome.port,
    logLevel: "error",
    output: ["json", "html"],
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor: "desktop",
    screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: "simulate"
  });
  if (!result) throw new Error("Lighthouse did not return a result");
  const reports = Array.isArray(result.report) ? result.report : [result.report];
  await writeFile(join(outputDirectory, "landing.report.json"), reports[0], "utf8");
  if (reports[1]) await writeFile(join(outputDirectory, "landing.report.html"), reports[1], "utf8");

  const scores = Object.fromEntries(
    ["performance", "accessibility", "best-practices", "seo"].map((id) => [id, result.lhr.categories[id]?.score ?? 0])
  );
  const metrics = {
    firstContentfulPaint: result.lhr.audits["first-contentful-paint"]?.numericValue ?? Infinity,
    speedIndex: result.lhr.audits["speed-index"]?.numericValue ?? Infinity,
    largestContentfulPaint: result.lhr.audits["largest-contentful-paint"]?.numericValue ?? Infinity,
    totalBlockingTime: result.lhr.audits["total-blocking-time"]?.numericValue ?? Infinity,
    cumulativeLayoutShift: result.lhr.audits["cumulative-layout-shift"]?.numericValue ?? Infinity
  };
  const auditDiagnostics = Object.values(result.lhr.audits)
    .filter((audit) => audit && audit.scoreDisplayMode !== "notApplicable" && audit.score !== null && audit.score < 1)
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      score: audit.score,
      displayValue: audit.displayValue || null,
      numericValue: audit.numericValue ?? null,
      numericUnit: audit.numericUnit || null
    }))
    .sort((left, right) => (left.score ?? 1) - (right.score ?? 1));

  const assetsDirectory = join(process.cwd(), "apps/web/dist/assets");
  const assets = await readdir(assetsDirectory);
  async function largestMatching(pattern) {
    const matches = assets.filter((name) => pattern.test(name));
    if (!matches.length) throw new Error(`Missing bundle matching ${pattern}`);
    const sizes = await Promise.all(matches.map(async (name) => ({ name, size: (await stat(join(assetsDirectory, name))).size })));
    return sizes.sort((left, right) => right.size - left.size)[0];
  }
  const bundles = {
    landing: await largestMatching(/^index-.*\.js$/),
    application: await largestMatching(/^AppEntry-.*\.js$/)
  };

  const summary = { scores, metrics, bundles, auditDiagnostics };
  await writeFile(join(outputDirectory, "landing.summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));

  const failures = [];
  if (scores.performance < 0.85) failures.push(`performance=${scores.performance}`);
  if (scores.accessibility < 0.95) failures.push(`accessibility=${scores.accessibility}`);
  if (scores["best-practices"] < 0.95) failures.push(`best-practices=${scores["best-practices"]}`);
  if (scores.seo < 0.95) failures.push(`seo=${scores.seo}`);
  if (metrics.firstContentfulPaint > 2200) failures.push(`FCP=${metrics.firstContentfulPaint}`);
  if (metrics.speedIndex > 3500) failures.push(`SI=${metrics.speedIndex}`);
  if (metrics.largestContentfulPaint > 3000) failures.push(`LCP=${metrics.largestContentfulPaint}`);
  if (metrics.totalBlockingTime > 400) failures.push(`TBT=${metrics.totalBlockingTime}`);
  if (metrics.cumulativeLayoutShift > 0.1) failures.push(`CLS=${metrics.cumulativeLayoutShift}`);
  if (bundles.landing.size > 240_000) failures.push(`landingBundle=${bundles.landing.size}`);
  if (bundles.application.size > 540_000) failures.push(`applicationBundle=${bundles.application.size}`);
  if (failures.length) throw new Error(`Landing production gate failed: ${failures.join(", ")}`);
} finally {
  if (chrome) {
    try { await chrome.kill(); } catch {}
  }
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    server.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
  await rm(configDirectory, { recursive: true, force: true });
}
