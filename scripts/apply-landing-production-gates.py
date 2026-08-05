from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {count}")
    path.write_text(source.replace(old, new), encoding="utf-8")


# Remove generated browser evidence accidentally committed by the rebase verification run.
for artifact in Path("apps/web").glob("artifacts-*.png"):
    artifact.unlink(missing_ok=True)
Path("Cargo.lock").unlink(missing_ok=True)

server_path = Path("apps/web/server.mjs")
lead_store = r'''
function createLeadStore(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      company TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_leads_created
      ON sales_leads(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_leads_status
      ON sales_leads(status, created_at DESC);
  `);

  const insertLead = db.prepare(`
    INSERT INTO sales_leads (
      id, name, contact, company, source, status, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectLeads = db.prepare(`
    SELECT id, name, contact, company, source, status, user_agent, created_at
      FROM sales_leads
     ORDER BY created_at DESC
     LIMIT ?
  `);
  const deleteLead = db.prepare("DELETE FROM sales_leads WHERE id = ?");

  function createLead(input) {
    const lead = {
      id: randomUUID(),
      name: input.name,
      contact: input.contact,
      company: input.company,
      source: input.source,
      status: "new",
      userAgent: input.userAgent,
      createdAt: nowIso()
    };
    insertLead.run(
      lead.id,
      lead.name,
      lead.contact,
      lead.company,
      lead.source,
      lead.status,
      lead.userAgent,
      lead.createdAt
    );
    return lead;
  }

  function leads(limit = 100) {
    const boundedLimit = Math.min(500, Math.max(1, Math.floor(asNumber(limit, 100))));
    return selectLeads.all(boundedLimit).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      contact: String(row.contact),
      company: String(row.company),
      source: String(row.source),
      status: String(row.status),
      userAgent: String(row.user_agent),
      createdAt: String(row.created_at)
    }));
  }

  function removeLead(id) {
    return Number(deleteLead.run(id).changes) > 0;
  }

  function close() {
    db.close();
  }

  return { close, createLead, leads, removeLead };
}

'''
replace_once(
    server_path,
    "\n\nfunction calculateEstimateTotals(estimate) {",
    "\n\n" + lead_store + "function calculateEstimateTotals(estimate) {",
)
replace_once(
    server_path,
    "const workflowStore = createWorkflowStore(estimateDatabaseFile);",
    "const workflowStore = createWorkflowStore(estimateDatabaseFile);\nconst leadStore = createLeadStore(estimateDatabaseFile);",
)
replace_once(
    server_path,
    "const maxBodyBytes = 2 * 1024 * 1024;",
    '''const maxBodyBytes = 2 * 1024 * 1024;
const leadRateWindowMs = 10 * 60 * 1000;
const leadRateMaxRequests = 5;
const leadRateLimits = new Map();''',
)

lead_helpers = r'''
function leadClientKey(request) {
  const forwarded = Array.isArray(request.headers["x-forwarded-for"])
    ? request.headers["x-forwarded-for"][0]
    : request.headers["x-forwarded-for"];
  const address = String(forwarded || request.socket.remoteAddress || "unknown").split(",")[0].trim();
  const userAgent = String(request.headers["user-agent"] || "unknown").slice(0, 240);
  return createHash("sha256").update(`${address}\u0000${userAgent}`).digest("hex");
}

function consumeLeadRateLimit(request) {
  const now = Date.now();
  if (leadRateLimits.size > 1000) {
    for (const [key, value] of leadRateLimits) {
      if (now - value.startedAt >= leadRateWindowMs) leadRateLimits.delete(key);
    }
  }
  const key = leadClientKey(request);
  let state = leadRateLimits.get(key);
  if (!state || now - state.startedAt >= leadRateWindowMs) {
    state = { count: 0, startedAt: now };
  }
  state.count += 1;
  leadRateLimits.set(key, state);
  return state.count <= leadRateMaxRequests;
}

function validLeadContact(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 320) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) return true;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

'''
replace_once(
    server_path,
    "\nasync function normalizeAgentInput(input, existing = null) {",
    "\n" + lead_helpers + "async function normalizeAgentInput(input, existing = null) {",
)

lead_routes = r'''
  if (url.pathname === "/api/leads") {
    if (request.method === "POST") {
      if (!consumeLeadRateLimit(request)) {
        return sendError(response, 429, "LEAD_RATE_LIMIT", "Слишком много заявок. Повторите попытку позже.");
      }
      const body = await readJsonBody(request);
      if (optionalString(body.website, 200)) {
        return sendJson(response, 202, { accepted: true, persisted: false });
      }
      const name = optionalString(body.name, 160);
      const contact = optionalString(body.contact, 320);
      const company = optionalString(body.company, 320);
      const source = optionalString(body.source, 80) || "landing-enterprise";
      if (!name || !contact || !company) {
        return sendError(response, 400, "LEAD_FIELDS_REQUIRED", "Укажите имя, контакт и компанию.");
      }
      if (!validLeadContact(contact)) {
        return sendError(response, 400, "LEAD_CONTACT_INVALID", "Укажите корректный телефон или email.");
      }
      const lead = leadStore.createLead({
        name,
        contact,
        company,
        source,
        userAgent: String(request.headers["user-agent"] || "").slice(0, 500)
      });
      return sendJson(response, 201, {
        accepted: true,
        persisted: true,
        lead: { id: lead.id, status: lead.status, createdAt: lead.createdAt }
      });
    }
    if (request.method === "GET") {
      if (!(await requireAdmin(request, response))) return;
      return sendJson(response, 200, {
        leads: leadStore.leads(Number(url.searchParams.get("limit") || 100)),
        persistence: "sqlite"
      });
    }
  }

  const leadRoute = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (leadRoute && request.method === "DELETE") {
    if (!(await requireAdmin(request, response))) return;
    const leadId = decodeURIComponent(leadRoute[1]);
    if (!leadStore.removeLead(leadId)) {
      return sendError(response, 404, "LEAD_NOT_FOUND", "Заявка не найдена.");
    }
    return sendJson(response, 200, { deleted: true, id: leadId });
  }

'''
replace_once(
    server_path,
    '''  if (request.method === "GET" && url.pathname === "/api/estimates") {''',
    lead_routes + '''  if (request.method === "GET" && url.pathname === "/api/estimates") {''',
)
replace_once(
    server_path,
    "    workflowStore.close();\n    server.close(() => process.exit(0));",
    "    workflowStore.close();\n    leadStore.close();\n    server.close(() => process.exit(0));",
)

landing_path = Path("apps/web/src/landing/LandingPage.tsx")
replace_once(
    landing_path,
    'import { useMemo, useState } from "react";',
    'import { useMemo, useState, type FormEvent } from "react";',
)
replace_once(
    landing_path,
    '''type Plan = {
  name: string;
  price: string;
  note: string;
  featured?: boolean;
  features: readonly string[];
};''',
    '''type Plan = {
  name: string;
  price: string;
  note: string;
  featured?: boolean;
  features: readonly string[];
};

type LeadState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; id: string }
  | { status: "error"; message: string };''',
)
replace_once(
    landing_path,
    '  const [leadSent, setLeadSent] = useState(false);',
    '  const [leadState, setLeadState] = useState<LeadState>({ status: "idle" });',
)
replace_once(
    landing_path,
    '''  const runDemo = () => {
    setDemoReady(false);
    window.setTimeout(() => setDemoReady(true), 850);
  };
''',
    '''  const runDemo = () => {
    setDemoReady(false);
    window.setTimeout(() => setDemoReady(true), 850);
  };

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLeadState({ status: "sending" });
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: data.get("name"),
          contact: data.get("contact"),
          company: data.get("company"),
          website: data.get("website"),
          source: "landing-enterprise"
        })
      });
      const result = await response.json().catch(() => ({})) as {
        lead?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.lead?.id) {
        throw new Error(result.error?.message || "Не удалось сохранить заявку.");
      }
      form.reset();
      setLeadState({ status: "sent", id: result.lead.id });
    } catch (error) {
      setLeadState({
        status: "error",
        message: error instanceof Error ? error.message : "Не удалось сохранить заявку."
      });
    }
  };
''',
)
old_form = '''          <form className="growth-lead-form" onSubmit={(event) => { event.preventDefault(); setLeadSent(true); }}>
            {leadSent ? (
              <div className="growth-lead-success"><CheckIcon /><strong>Заявка принята</strong><p>Команда подготовит сценарий внедрения под вашу компанию.</p></div>
            ) : (
              <>
                <strong>Запросить корпоративную демонстрацию</strong>
                <label><span>Имя</span><input required name="name" autoComplete="name" /></label>
                <label><span>Рабочий телефон или email</span><input required name="contact" /></label>
                <label><span>Компания и число сотрудников</span><input required name="company" /></label>
                <button type="submit">Получить план внедрения <ArrowRightIcon /></button>
                <small>Отправляя форму, вы соглашаетесь на обработку контактных данных.</small>
              </>
            )}
          </form>'''
new_form = '''          <form className="growth-lead-form" onSubmit={(event) => void submitLead(event)} aria-busy={leadState.status === "sending"}>
            {leadState.status === "sent" ? (
              <div className="growth-lead-success" aria-live="polite"><CheckIcon /><strong>Заявка принята</strong><p>Команда подготовит сценарий внедрения под вашу компанию.</p></div>
            ) : (
              <>
                <strong>Запросить корпоративную демонстрацию</strong>
                <label><span>Имя</span><input required name="name" autoComplete="name" maxLength={160} /></label>
                <label><span>Рабочий телефон или email</span><input required name="contact" autoComplete="email" maxLength={320} /></label>
                <label><span>Компания и число сотрудников</span><input required name="company" autoComplete="organization" maxLength={320} /></label>
                <label className="growth-honeypot" aria-hidden="true"><span>Сайт</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
                {leadState.status === "error" ? <p className="growth-lead-error" role="alert">{leadState.message}</p> : null}
                <button type="submit" disabled={leadState.status === "sending"}>
                  {leadState.status === "sending" ? "Сохраняем заявку…" : <>Получить план внедрения <ArrowRightIcon /></>}
                </button>
                <small>Отправляя форму, вы соглашаетесь на обработку контактных данных.</small>
              </>
            )}
          </form>'''
replace_once(landing_path, old_form, new_form)

css_path = Path("apps/web/src/landing/landing.css")
css = css_path.read_text(encoding="utf-8")
css_addition = r'''

.growth-honeypot {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0 0 0 0) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}
.growth-lead-error { margin: 0; color: #b42318; font-size: 12px; line-height: 1.4; }
.growth-lead-form button:disabled { cursor: wait; opacity: .68; }
'''
if ".growth-honeypot" not in css:
    css_path.write_text(css.rstrip() + css_addition + "\n", encoding="utf-8")

landing_test_path = Path("apps/web/e2e/landing.spec.ts")
landing_test_path.write_text(r'''import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

test.describe("production landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/landing");
  });

  test("shows the product promise and interactive estimate demo", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: /От запроса до КС-3/ })).toBeVisible();
    await expect(page.getByText("Ремонт ванной комнаты", { exact: true })).toBeVisible();
    await expect(page.getByText("Предварительная стоимость", { exact: true })).toBeVisible();

    const prompt = page.getByRole("textbox", { name: "Запрос для демонстрации" });
    await prompt.fill("Составь смету на механизированную штукатурку 358 м² в Татарстане");
    await page.getByRole("button", { name: "Запустить демонстрацию" }).click();
    await expect(page.getByText(/Проверяю состав работ/)).toBeVisible();
    await expect(page.getByText("Расчёт готов", { exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts-landing-${testInfo.project.name}.png`, fullPage: true });
  });

  test("keeps the production application available on app route", async ({ page }, testInfo) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    if (testInfo.project.name === "mobile-chromium") {
      await expect(page.getByTestId("mobile-shell")).toBeVisible();
      await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    } else {
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Что нужно рассчитать?" })).toBeVisible();
    }
  });

  test("persists and verifies an enterprise lead", async ({ page }, testInfo) => {
    const appLink = page.getByRole("link", { name: /Составить первую смету/ });
    await expect(appLink).toHaveAttribute("href", "/app");

    if (external && !adminToken) {
      await expect(page.getByRole("button", { name: /Получить план внедрения/ })).toBeVisible();
      return;
    }

    const unique = `${testInfo.project.name}-${Date.now()}`;
    await page.getByRole("textbox", { name: "Имя" }).fill("Тестовый пользователь");
    await page.getByRole("textbox", { name: "Рабочий телефон или email" }).fill(`landing-${unique}@example.com`);
    await page.getByRole("textbox", { name: "Компания и число сотрудников" }).fill("Строй QA, 12");

    const leadResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/leads" && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: /Получить план внедрения/ }).click();
    const leadResponse = await leadResponsePromise;
    const leadBody = await leadResponse.json() as { lead?: { id?: string }; persisted?: boolean };
    expect(leadResponse.status()).toBe(201);
    expect(leadBody.persisted).toBe(true);
    expect(leadBody.lead?.id).toBeTruthy();
    await expect(page.getByText("Заявка принята", { exact: true })).toBeVisible();

    const headers = { "x-prosmet-admin-token": adminToken! };
    const listResponse = await page.request.get("/api/leads?limit=50", { headers });
    expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
    const list = await listResponse.json() as { leads?: Array<{ id: string; contact: string }> };
    expect(list.leads?.some((lead) => lead.id === leadBody.lead?.id && lead.contact === `landing-${unique}@example.com`)).toBe(true);

    const deleteResponse = await page.request.delete(`/api/leads/${encodeURIComponent(leadBody.lead!.id!)}`, { headers });
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
    await page.screenshot({ path: `artifacts-landing-lead-${testInfo.project.name}.png`, fullPage: true });
  });

  test("protects lead administration and validates required fields", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "API boundary runs once");
    const unauthenticated = await page.request.get("/api/leads");
    expect(unauthenticated.status()).toBe(401);
    const invalid = await page.request.post("/api/leads", { data: { name: "Only name" } });
    expect(invalid.status()).toBe(400);
  });

  test("has no horizontal overflow on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only geometry assertion");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
  });
});
''', encoding="utf-8")

lighthouse_path = Path("scripts/run-landing-lighthouse.mjs")
lighthouse_path.write_text(r'''import { spawn } from "node:child_process";
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
    largestContentfulPaint: result.lhr.audits["largest-contentful-paint"]?.numericValue ?? Infinity,
    totalBlockingTime: result.lhr.audits["total-blocking-time"]?.numericValue ?? Infinity,
    cumulativeLayoutShift: result.lhr.audits["cumulative-layout-shift"]?.numericValue ?? Infinity
  };

  const assetsDirectory = join(process.cwd(), "apps/web/dist/assets");
  const assets = await readdir(assetsDirectory);
  async function largestMatching(pattern) {
    const matches = assets.filter((name) => pattern.test(name));
    if (!matches.length) throw new Error(`Missing bundle matching ${pattern}`);
    const sizes = await Promise.all(matches.map(async (name) => ({ name, size: (await stat(join(assetsDirectory, name))).size })));
    return sizes.sort((left, right) => right.size - left.size)[0];
  }
  const bundles = {
    landing: await largestMatching(/^LandingPage-.*\.js$/),
    application: await largestMatching(/^AppEntry-.*\.js$/),
    shared: await largestMatching(/^index-.*\.js$/)
  };

  const summary = { scores, metrics, bundles };
  await writeFile(join(outputDirectory, "landing.summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));

  const failures = [];
  if (scores.performance < 0.85) failures.push(`performance=${scores.performance}`);
  if (scores.accessibility < 0.95) failures.push(`accessibility=${scores.accessibility}`);
  if (scores["best-practices"] < 0.95) failures.push(`best-practices=${scores["best-practices"]}`);
  if (scores.seo < 0.95) failures.push(`seo=${scores.seo}`);
  if (metrics.largestContentfulPaint > 3000) failures.push(`LCP=${metrics.largestContentfulPaint}`);
  if (metrics.totalBlockingTime > 400) failures.push(`TBT=${metrics.totalBlockingTime}`);
  if (metrics.cumulativeLayoutShift > 0.1) failures.push(`CLS=${metrics.cumulativeLayoutShift}`);
  if (bundles.landing.size > 60_000) failures.push(`landingBundle=${bundles.landing.size}`);
  if (bundles.application.size > 540_000) failures.push(`applicationBundle=${bundles.application.size}`);
  if (bundles.shared.size > 240_000) failures.push(`sharedBundle=${bundles.shared.size}`);
  if (failures.length) throw new Error(`Landing production gate failed: ${failures.join(", ")}`);
} finally {
  await chrome?.kill().catch(() => undefined);
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    server.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
  await rm(configDirectory, { recursive: true, force: true });
}
''', encoding="utf-8")

package_path = Path("package.json")
package_data = json.loads(package_path.read_text(encoding="utf-8"))
package_data.setdefault("scripts", {})["lighthouse:landing"] = "node scripts/run-landing-lighthouse.mjs"
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

contract_path = Path("scripts/greenfield-contract.mjs")
contract = contract_path.read_text(encoding="utf-8")
contract = contract.replace(
    '  "apps/web/e2e/fixture-agent.mjs",',
    '  "apps/web/e2e/fixture-agent.mjs",\n  "apps/web/e2e/landing.spec.ts",\n  "apps/web/src/landing/LandingPage.tsx",\n  "scripts/run-landing-lighthouse.mjs",',
    1,
)
contract = contract.replace(
    'const e2e = await read("apps/web/e2e/app.spec.ts");',
    'const e2e = await read("apps/web/e2e/app.spec.ts");\nconst landing = await read("apps/web/src/landing/LandingPage.tsx");\nconst landingE2e = await read("apps/web/e2e/landing.spec.ts");',
    1,
)
guards = r'''
for (const token of [
  "CREATE TABLE IF NOT EXISTS sales_leads",
  'url.pathname === "/api/leads"',
  "leadStore.createLead",
  "leadStore.leads",
  "leadStore.removeLead",
  "consumeLeadRateLimit"
]) {
  if (!server.includes(token)) failures.push(`landing:lead-api-contract-missing:${token}`);
}
if (!landing.includes('fetch("/api/leads"')) failures.push("landing:lead-form-not-persisted");
if (!landingE2e.includes('page.request.get("/api/leads?limit=50"')) failures.push("landing:lead-persistence-e2e-missing");
if (!landingE2e.includes('page.request.delete(`/api/leads/')) failures.push("landing:lead-cleanup-e2e-missing");

'''
marker = "if (failures.length) {"
if guards not in contract:
    if contract.count(marker) != 1:
        raise SystemExit("Contract final marker missing")
    contract = contract.replace(marker, guards + marker)
contract_path.write_text(contract, encoding="utf-8")

final_workflow = '''name: Prosmet Greenfield Quality

on:
  pull_request:
    branches: [main]
  push:
    branches: [greenfield/prosmet-v3]

permissions:
  contents: read

concurrency:
  group: prosmet-greenfield-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: [self-hosted, Linux, X64]
    timeout-minutes: 55
    env:
      CI: "1"
    steps:
      - name: Verify trusted runner
        run: test "${{ runner.name }}" = "prosmet-primary"

      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22.16.0

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt

      - name: Install clean workspace
        run: npm ci --workspaces --include-workspace-root --legacy-peer-deps --no-audit --no-fund

      - name: Source, assistant-ui, TypeScript, unit and build verification
        run: npm run verify

      - name: Desktop manifest
        run: npm run desktop:metadata

      - name: Install Chromium
        run: npx playwright install chromium

      - name: Desktop, mobile, landing and lifecycle browser acceptance
        run: npm run e2e

      - name: Landing Lighthouse and bundle budgets
        run: npm run lighthouse:landing

      - name: Upload browser and performance evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: prosmet-greenfield-${{ github.run_id }}
          path: |
            apps/web/playwright-report
            apps/web/test-results
            apps/web/artifacts-*.png
            apps/web/lighthouse
          if-no-files-found: warn
          retention-days: 14
'''
Path(".github/workflows/greenfield-ci.yml").write_text(final_workflow, encoding="utf-8")
