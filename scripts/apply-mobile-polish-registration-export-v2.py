from __future__ import annotations

import re
from pathlib import Path


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def replace_function(source: str, name: str, replacement_body: str) -> str:
    start = source.find(f"function {name}")
    if start < 0:
        raise SystemExit(f"missing function {name}")
    brace = source.find("{", start)
    depth = 0
    end = None
    for i in range(brace, len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise SystemExit(f"unterminated function {name}")
    return source[:brace + 1] + "\n" + replacement_body.strip() + "\n" + source[end - 1:]


write("apps/web/src/features/estimate/branded-export.ts", r'''
type EstimateLike = { title?: string; project?: string; customer?: string; region?: string; revision?: string | number; status?: string; sections?: Array<{ title?: string; items?: Array<{ name?: string; unit?: string; quantity?: number | string; unitPrice?: number | string; note?: string }> }>; totals?: { direct?: number; overhead?: number; profit?: number; vat?: number; total?: number } };
export const exportBrand = { ink: "#0D0F12", muted: "#5F6673", blue: "#1267E5", cyan: "#2CC7F0", green: "#107C55", soft: "#F4F7FB", line: "#DDE6F2" } as const;
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = (v: number) => `${Math.round(v).toLocaleString("ru-RU")} ₽`;
const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const filePart = (v: unknown) => (String(v || "smeta").replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "smeta");
function estimate(v: unknown): EstimateLike { return v && typeof v === "object" ? v as EstimateLike : {}; }
function rows(e: EstimateLike) { return (e.sections || []).flatMap((s) => (s.items || []).map((item) => ({ section: s.title || "Работы и материалы", item, total: n(item.quantity) * n(item.unitPrice) }))); }
function sums(e: EstimateLike) { const direct = e.totals?.direct ?? rows(e).reduce((a, r) => a + r.total, 0); const overhead = e.totals?.overhead ?? 0; const profit = e.totals?.profit ?? 0; const vat = e.totals?.vat ?? 0; const total = e.totals?.total ?? direct + overhead + profit + vat; return { direct, overhead, profit, vat, total }; }
export function exportFileName(value: unknown, extension: "pdf" | "xls") { const e = estimate(value); return `prosmet-${filePart(e.title || e.project)}.${extension}`; }
export function buildBrandedPrintHtml(value: unknown) {
  const e = estimate(value); const r = rows(e); const s = sums(e); const title = e.title || "Строительная смета";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>${esc(title)} — ProSmet PDF</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:${exportBrand.ink};font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.bar{height:9px;border-radius:999px;background:linear-gradient(90deg,${exportBrand.blue},${exportBrand.cyan},${exportBrand.green});margin-bottom:22px}header{display:flex;justify-content:space-between;border-bottom:1px solid ${exportBrand.line};padding-bottom:16px}.brand{font-size:22px;font-weight:850;letter-spacing:-.04em}.brand span{display:inline-grid;place-items:center;width:36px;height:36px;margin-right:10px;border-radius:12px;background:${exportBrand.ink};color:#fff}h1{font-size:28px;line-height:1.08;letter-spacing:-.05em;margin:24px 0 10px}.chips{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 24px}.chip{background:${exportBrand.soft};border:1px solid ${exportBrand.line};border-radius:14px;padding:10px;color:${exportBrand.muted}}.chip b{display:block;color:${exportBrand.ink}}table{width:100%;border-collapse:collapse;border-radius:16px;overflow:hidden}th{background:${exportBrand.blue};color:#fff;text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.04em}td,th{border-bottom:1px solid ${exportBrand.line};padding:9px}tbody tr:nth-child(even) td{background:#f8fbff}.num{text-align:right;white-space:nowrap}.sec{color:${exportBrand.blue};font-size:10px;font-weight:800}.totals{width:320px;margin:24px 0 0 auto;border:1px solid ${exportBrand.line};border-radius:16px;overflow:hidden}.totals div{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid ${exportBrand.line}}.totals div:last-child{border:0;background:linear-gradient(90deg,${exportBrand.blue},${exportBrand.green});color:#fff;font-size:16px;font-weight:850}footer{margin-top:26px;padding-top:12px;border-top:1px solid ${exportBrand.line};color:${exportBrand.muted};font-size:10px}</style></head><body><div class="bar"></div><header><div class="brand"><span>PS</span>ProSmet</div><div>Ревизия: ${esc(e.revision || 1)}<br/>Статус: ${esc(e.status || "draft")}</div></header><h1>${esc(title)}</h1><section class="chips"><div class="chip">Проект<b>${esc(e.project || "Не указан")}</b></div><div class="chip">Заказчик<b>${esc(e.customer || "Не указан")}</b></div><div class="chip">Регион<b>${esc(e.region || "Не указан")}</b></div></section><table><thead><tr><th>Раздел / позиция</th><th>Ед.</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead><tbody>${r.map(({section,item,total})=>`<tr><td><span class="sec">${esc(section)}</span><br/><b>${esc(item.name || "Позиция")}</b>${item.note ? `<br/><small>${esc(item.note)}</small>` : ""}</td><td>${esc(item.unit || "")}</td><td class="num">${n(item.quantity).toLocaleString("ru-RU")}</td><td class="num">${money(n(item.unitPrice))}</td><td class="num"><b>${money(total)}</b></td></tr>`).join("")}</tbody></table><section class="totals"><div><span>Прямые затраты</span><b>${money(s.direct)}</b></div><div><span>Накладные</span><b>${money(s.overhead)}</b></div><div><span>Сметная прибыль</span><b>${money(s.profit)}</b></div><div><span>НДС</span><b>${money(s.vat)}</b></div><div><span>Итого</span><b>${money(s.total)}</b></div></section><footer>Документ создан в ProSmet. Перед передачей заказчику смета должна быть проверена ответственным специалистом.</footer></body></html>`;
}
export function buildBrandedExcelHtml(value: unknown) {
  const e = estimate(value); const r = rows(e); const s = sums(e); const title = e.title || "Строительная смета";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><style>table{border-collapse:collapse;font-family:Arial,sans-serif}td,th{border:1px solid ${exportBrand.line};padding:8px}th{background:${exportBrand.blue};color:#fff}.brand{background:${exportBrand.ink};color:#fff;font-size:20px;font-weight:800}.accent{background:${exportBrand.soft};color:${exportBrand.blue};font-weight:700}.total{background:${exportBrand.green};color:#fff;font-weight:800}</style></head><body><table><tr><td class="brand" colspan="6">ProSmet — ${esc(title)}</td></tr><tr><td class="accent">Проект</td><td colspan="2">${esc(e.project || "")}</td><td class="accent">Регион</td><td colspan="2">${esc(e.region || "")}</td></tr><tr><th>Раздел</th><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>${r.map(({section,item,total})=>`<tr><td>${esc(section)}</td><td>${esc(item.name || "Позиция")}</td><td>${esc(item.unit || "")}</td><td>${n(item.quantity)}</td><td>${n(item.unitPrice)}</td><td>${total}</td></tr>`).join("")}<tr><td colspan="5" class="accent">Прямые затраты</td><td>${s.direct}</td></tr><tr><td colspan="5" class="accent">НДС</td><td>${s.vat}</td></tr><tr><td colspan="5" class="total">Итого</td><td class="total">${s.total}</td></tr></table></body></html>`;
}
export function downloadHtmlFile(html: string, filename: string, mime: string) { const blob = new Blob(["\ufeff", html], { type: `${mime};charset=utf-8` }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
''')

write("apps/web/src/features/estimate/branded-export.test.ts", r'''import { describe, expect, it } from "vitest";
import { buildBrandedExcelHtml, buildBrandedPrintHtml, exportBrand } from "./branded-export";
const sample = { title: "Механизированная штукатурка стен", project: "Дом", region: "Татарстан", sections: [{ title: "Работы", items: [{ name: "Штукатурка гипсовая", unit: "м²", quantity: 358, unitPrice: 500 }] }], totals: { direct: 179000, overhead: 0, profit: 0, vat: 0, total: 179000 } };
describe("branded exports", () => { it("creates Cyrillic PDF print HTML", () => { const html = buildBrandedPrintHtml(sample); expect(html).toContain("Механизированная"); expect(html).toContain("ProSmet"); expect(html).toContain(exportBrand.blue); }); it("creates branded Excel HTML", () => { const html = buildBrandedExcelHtml(sample); expect(html).toContain("<table>"); expect(html).toContain(exportBrand.green); }); });
''')

write("apps/web/src/features/account/UserRegistrationPanel.tsx", r'''import { useState, type FormEvent } from "react";
type State = { status: "idle" | "sending" } | { status: "success"; email: string } | { status: "error"; message: string };
export function UserRegistrationPanel() {
  const [state, setState] = useState<State>({ status: "idle" });
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setState({ status: "sending" }); try { const response = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: data.get("name"), email: data.get("email"), company: data.get("company"), password: data.get("password") }) }); const result = await response.json().catch(() => ({})) as { user?: { email?: string }; error?: { message?: string } }; if (!response.ok || !result.user?.email) throw new Error(result.error?.message || "Не удалось создать пользователя."); form.reset(); setState({ status: "success", email: result.user.email }); } catch (error) { setState({ status: "error", message: error instanceof Error ? error.message : "Не удалось создать пользователя." }); } };
  return <section className="registration-panel" aria-labelledby="registration-title"><div className="registration-panel__copy"><span>Регистрация</span><h2 id="registration-title">Создайте пользователя ProSmet</h2><p>Аккаунт фиксируется на сервере, чтобы дальше подключить роли, организации и историю смет.</p></div><form className="registration-panel__form" onSubmit={(event) => void submit(event)} aria-busy={state.status === "sending"}><label><span>Имя</span><input required name="name" autoComplete="name" maxLength={160} /></label><label><span>Email</span><input required name="email" type="email" autoComplete="email" maxLength={320} /></label><label><span>Компания</span><input required name="company" autoComplete="organization" maxLength={220} /></label><label><span>Пароль</span><input required name="password" type="password" autoComplete="new-password" minLength={8} maxLength={160} /></label>{state.status === "error" ? <p className="registration-panel__error" role="alert">{state.message}</p> : null}{state.status === "success" ? <p className="registration-panel__success" role="status">Пользователь {state.email} зарегистрирован.</p> : null}<button type="submit" disabled={state.status === "sending"}>{state.status === "sending" ? "Создаём…" : "Зарегистрироваться"}</button></form></section>;
}
''')

write("apps/web/src/mobile-brand-polish.css", r''':root{--prosmet-brand-blue:#1267e5;--prosmet-brand-cyan:#2cc7f0;--prosmet-brand-green:#107c55;--prosmet-brand-ink:#0d0f12;--prosmet-brand-soft:#f4f7fb}.registration-panel{display:grid;grid-template-columns:minmax(0,.95fr) minmax(280px,.75fr);gap:22px;margin-top:22px;border:1px solid rgba(18,103,229,.14);border-radius:28px;background:radial-gradient(circle at 12% 0%,rgba(44,199,240,.18),transparent 34%),linear-gradient(135deg,#fff,#f7fbff 68%,rgba(18,103,229,.08));padding:24px;box-shadow:0 22px 60px rgba(13,15,18,.08)}.registration-panel__copy>span{display:inline-flex;min-height:28px;align-items:center;border-radius:999px;background:rgba(18,103,229,.1);color:var(--prosmet-brand-blue);padding:0 10px;font-size:12px;font-weight:800}.registration-panel__copy h2{margin:16px 0 0;font-size:clamp(24px,4vw,36px);line-height:1.05;letter-spacing:-.05em}.registration-panel__copy p{margin:12px 0 0;color:#667085;line-height:1.55}.registration-panel__form{display:grid;gap:12px;border-radius:22px;background:rgba(255,255,255,.78);padding:16px;box-shadow:inset 0 0 0 1px rgba(18,103,229,.09)}.registration-panel__form label{display:grid;gap:6px;color:#667085;font-size:12px;font-weight:700}.registration-panel__form input{min-height:44px;border:1px solid rgba(18,103,229,.18);border-radius:14px;background:#fff;padding:0 13px;color:var(--prosmet-brand-ink);outline:0}.registration-panel__form input:focus{border-color:var(--prosmet-brand-blue);box-shadow:0 0 0 4px rgba(18,103,229,.11)}.registration-panel__form button{min-height:46px;border:0;border-radius:15px;background:linear-gradient(135deg,var(--prosmet-brand-blue),var(--prosmet-brand-green));color:#fff;font-weight:850}.registration-panel__error{margin:0;color:#b42318;font-size:12px}.registration-panel__success{margin:0;color:var(--prosmet-brand-green);font-size:12px;font-weight:800}@media(max-width:760px){.mobile-shell,[data-testid="mobile-shell"]{background:radial-gradient(circle at 20% -10%,rgba(18,103,229,.16),transparent 34%),radial-gradient(circle at 95% 8%,rgba(44,199,240,.13),transparent 30%),linear-gradient(180deg,#f8fbff 0%,#fff 34%,#f6f8fb 100%)!important}.mobile-reference-start,[data-testid="mobile-reference-start"]{border:1px solid rgba(18,103,229,.12)!important;background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(244,248,255,.94))!important;box-shadow:0 18px 45px rgba(18,103,229,.10)!important}.mobile-estimate-item,.mobile-section,.mobile-card,.mobile-panel,.registration-panel{border-color:rgba(18,103,229,.14)!important;box-shadow:0 14px 36px rgba(13,15,18,.08)!important}.mobile-estimate-item{background:linear-gradient(90deg,rgba(18,103,229,.10),transparent 5px),linear-gradient(180deg,#fff,#f9fbff)!important}.mobile-item-head>textarea,.mobile-item-head>input{color:var(--prosmet-brand-ink)!important}.mobile-total,.mobile-summary,.mobile-sticky-actions,.mobile-bottom-sheet footer{background:linear-gradient(135deg,rgba(18,103,229,.96),rgba(16,124,85,.94))!important;color:#fff!important}.mobile-tabbar button[aria-selected="true"],.mobile-nav button[aria-current="page"],.mobile-drawer a[aria-current="page"]{background:rgba(18,103,229,.11)!important;color:var(--prosmet-brand-blue)!important}.registration-panel{grid-template-columns:1fr;margin:14px 0 0;border-radius:24px;padding:18px}.registration-panel__copy h2{font-size:25px}}
''')

# App CSS import
p = Path("apps/web/src/app/AppEntry.tsx"); s = p.read_text(encoding="utf-8")
if "../mobile-brand-polish.css" not in s:
    s = s.replace('import "../professional-polish-v2.css";\n', 'import "../professional-polish-v2.css";\nimport "../mobile-brand-polish.css";\n', 1)
p.write_text(s, encoding="utf-8")

# Estimate export integration
p = Path("apps/web/src/features/estimate/EstimateEditor.tsx"); s = p.read_text(encoding="utf-8")
if "./branded-export" not in s:
    pos = s.find("\n\n", s.rfind("import "))
    s = s[:pos] + '\nimport { buildBrandedExcelHtml, buildBrandedPrintHtml, downloadHtmlFile, exportFileName } from "./branded-export";' + s[pos:]
if "buildBrandedPrintHtml(estimate)" not in s:
    s = replace_function(s, "printEstimate", 'const html = buildBrandedPrintHtml(estimate);\n  const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=1200");\n  if (popup) { popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus(); window.setTimeout(() => popup.print(), 350); return; }\n  downloadHtmlFile(html, exportFileName(estimate, "pdf").replace(/\\.pdf$/, "-print.html"), "text/html");')
if "buildBrandedExcelHtml(estimate)" not in s:
    s = replace_function(s, "downloadExcel", 'const html = buildBrandedExcelHtml(estimate);\n  downloadHtmlFile(html, exportFileName(estimate, "xls"), "application/vnd.ms-excel");')
p.write_text(s, encoding="utf-8")

# Account panel integration
p = Path("apps/web/src/features/account/AccountView.tsx"); s = p.read_text(encoding="utf-8")
if "UserRegistrationPanel" not in s:
    pos = s.find("\n\n", s.rfind("import "))
    s = s[:pos] + '\nimport { UserRegistrationPanel } from "./UserRegistrationPanel";' + s[pos:]
    ns = re.sub(r"(\n\s*</div>\s*\);\s*\n}\s*)$", "\n      <UserRegistrationPanel />\\1", s, count=1)
    if ns == s: raise SystemExit("AccountView insertion marker not found")
    s = ns
p.write_text(s, encoding="utf-8")

# Server API
p = Path("apps/web/server.mjs"); s = p.read_text(encoding="utf-8")
if "scryptSync" not in s:
    s = s.replace("randomUUID,\n  timingSafeEqual", "randomUUID,\n  scryptSync,\n  timingSafeEqual", 1)
USER_STORE = r'''
function boundedUserString(value, maxLength = 320) { const text = String(value ?? "").trim(); return text ? text.slice(0, maxLength) : ""; }
function normalizeRegisteredEmail(value) { return boundedUserString(value, 320).toLowerCase(); }
function validRegisteredEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || "")); }
function hashRegisteredPassword(password) { const salt = randomBytes(16).toString("base64url"); const hash = scryptSync(String(password), salt, 64).toString("base64url"); return `scrypt.v1.${salt}.${hash}`; }
function createUserStore(databasePath) {
  const db = new DatabaseSync(databasePath); db.exec("PRAGMA foreign_keys = ON"); db.exec("PRAGMA journal_mode = WAL"); db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`CREATE TABLE IF NOT EXISTS registered_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, company TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_registered_users_created ON registered_users(created_at DESC);`);
  const insertUser = db.prepare(`INSERT INTO registered_users (id, name, email, company, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const findByEmailStmt = db.prepare(`SELECT id, name, email, company, role, status, created_at, updated_at FROM registered_users WHERE email = ?`);
  const listUsersStmt = db.prepare(`SELECT id, name, email, company, role, status, created_at, updated_at FROM registered_users ORDER BY created_at DESC LIMIT ?`);
  const deleteUserStmt = db.prepare("DELETE FROM registered_users WHERE id = ?");
  const pub = (row) => row ? ({ id: String(row.id), name: String(row.name), email: String(row.email), company: String(row.company), role: String(row.role), status: String(row.status), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }) : null;
  function findByEmail(email) { return pub(findByEmailStmt.get(email)); }
  function registerUser(input) { const now = nowIso(); const user = { id: randomUUID(), name: input.name, email: input.email, company: input.company, passwordHash: hashRegisteredPassword(input.password), role: "owner", status: "active", createdAt: now, updatedAt: now }; insertUser.run(user.id, user.name, user.email, user.company, user.passwordHash, user.role, user.status, user.createdAt, user.updatedAt); return pub({ id: user.id, name: user.name, email: user.email, company: user.company, role: user.role, status: user.status, created_at: user.createdAt, updated_at: user.updatedAt }); }
  function users(limit = 100) { return listUsersStmt.all(Math.min(500, Math.max(1, Math.floor(asNumber(limit, 100))))).map(pub).filter(Boolean); }
  function removeUser(id) { return Number(deleteUserStmt.run(id).changes) > 0; }
  function close() { db.close(); }
  return { close, findByEmail, registerUser, removeUser, users };
}
'''
if "CREATE TABLE IF NOT EXISTS registered_users" not in s:
    s = s.replace("\nfunction calculateEstimateTotals(estimate) {", "\n" + USER_STORE + "\nfunction calculateEstimateTotals(estimate) {", 1)
if "const userStore = createUserStore" not in s:
    s = s.replace("const workflowStore = createWorkflowStore(estimateDatabaseFile);\nconst leadStore = createLeadStore(estimateDatabaseFile);", "const workflowStore = createWorkflowStore(estimateDatabaseFile);\nconst leadStore = createLeadStore(estimateDatabaseFile);\nconst userStore = createUserStore(estimateDatabaseFile);", 1)
USER_ROUTES = r'''
  if (url.pathname === "/api/register" || url.pathname === "/api/users/register") {
    if (request.method !== "POST") return sendError(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readJsonBody(request); const name = boundedUserString(body.name, 160); const email = normalizeRegisteredEmail(body.email); const company = boundedUserString(body.company, 220); const password = String(body.password || "");
    if (!name || !email || !company || !password) return sendError(response, 400, "REGISTRATION_FIELDS_REQUIRED", "Укажите имя, email, компанию и пароль.");
    if (!validRegisteredEmail(email)) return sendError(response, 400, "REGISTRATION_EMAIL_INVALID", "Укажите корректный email.");
    if (password.length < 8 || password.length > 160) return sendError(response, 400, "REGISTRATION_PASSWORD_INVALID", "Пароль должен быть не короче 8 символов.");
    if (userStore.findByEmail(email)) return sendError(response, 409, "REGISTRATION_EMAIL_EXISTS", "Пользователь с таким email уже зарегистрирован.");
    return sendJson(response, 201, { registered: true, user: userStore.registerUser({ name, email, company, password }) });
  }
  if (url.pathname === "/api/users" && request.method === "GET") { if (!(await requireAdmin(request, response))) return; return sendJson(response, 200, { users: userStore.users(Number(url.searchParams.get("limit") || 100)), persistence: "sqlite" }); }
  const registeredUserRoute = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (registeredUserRoute && request.method === "DELETE") { if (!(await requireAdmin(request, response))) return; const userId = decodeURIComponent(registeredUserRoute[1]); if (!userStore.removeUser(userId)) return sendError(response, 404, "REGISTERED_USER_NOT_FOUND", "Пользователь не найден."); return sendJson(response, 200, { deleted: true, id: userId }); }

'''
if 'url.pathname === "/api/register"' not in s:
    s = s.replace('  if (request.method === "GET" && url.pathname === "/api/estimates") {', USER_ROUTES + '  if (request.method === "GET" && url.pathname === "/api/estimates") {', 1)
if "userStore.close" not in s:
    s = s.replace("    leadStore.close();\n    server.close(() => process.exit(0));", "    leadStore.close();\n    userStore.close();\n    server.close(() => process.exit(0));", 1)
p.write_text(s, encoding="utf-8")

# E2E API registration
write("apps/web/e2e/registration-export.spec.ts", r'''import { expect, test } from "@playwright/test";
const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";
test("registered users persist, duplicate emails are rejected, and admin access is protected", async ({ page }, testInfo) => {
  if (external && !adminToken) test.skip(true, "External admin token is required");
  const email = `prosmet-${testInfo.project.name}-${Date.now()}@example.com`;
  const created = await page.request.post("/api/register", { data: { name: "Пользователь ProSmet", email, company: "Строй QA", password: "StrongPass123" } });
  expect(created.status(), await created.text()).toBe(201);
  const body = await created.json() as { user?: { id?: string; email?: string } };
  expect(body.user?.email).toBe(email);
  expect((await page.request.post("/api/register", { data: { name: "Повтор", email, company: "Строй QA", password: "StrongPass123" } })).status()).toBe(409);
  expect((await page.request.get("/api/users")).status()).toBe(401);
  const headers = { "x-prosmet-admin-token": adminToken! };
  const list = await page.request.get("/api/users?limit=50", { headers }); expect(list.ok(), await list.text()).toBeTruthy();
  expect(((await list.json()) as { users?: Array<{ id: string; email: string }> }).users?.some((u) => u.id === body.user?.id && u.email === email)).toBe(true);
  const removed = await page.request.delete(`/api/users/${encodeURIComponent(body.user!.id!)}`, { headers }); expect(removed.ok(), await removed.text()).toBeTruthy();
});
''')

# Contract checks
p = Path("scripts/greenfield-contract.mjs"); s = p.read_text(encoding="utf-8")
if '"apps/web/src/mobile-brand-polish.css"' not in s:
    s = s.replace('  "apps/web/src/agent-integrations.css",', '  "apps/web/src/agent-integrations.css",\n  "apps/web/src/mobile-brand-polish.css",\n  "apps/web/src/features/estimate/branded-export.ts",\n  "apps/web/src/features/account/UserRegistrationPanel.tsx",\n  "apps/web/e2e/registration-export.spec.ts",', 1)
if "registration:server-contract-missing" not in s:
    guard = 'for (const token of ["CREATE TABLE IF NOT EXISTS registered_users", \'url.pathname === "/api/register"\', \'url.pathname === "/api/users"\', "hashRegisteredPassword", "scryptSync"]) { if (!server.includes(token)) failures.push(`registration:server-contract-missing:${token}`); }\nif (!webAccount.includes("UserRegistrationPanel")) failures.push("registration:account-ui-missing");\nif (!webEstimate.includes("buildBrandedPrintHtml") || !webEstimate.includes("buildBrandedExcelHtml")) failures.push("exports:branded-pdf-excel-missing");\n'
    s = s.replace("if (failures.length) {", guard + "\nif (failures.length) {", 1)
p.write_text(s, encoding="utf-8")
