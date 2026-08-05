from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {count}")
    path.write_text(source.replace(old, new), encoding="utf-8")


# ---- Contracts ----
contracts = Path("packages/contracts/src/index.ts")
source = contracts.read_text(encoding="utf-8")
source = source.replace(
    '''export type AccountProfile = {
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "super_admin";
  updatedAt: string;
};
''',
    '''export type AccountProfile = {
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "super_admin";
  updatedAt: string;
};

export type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "owner" | "member";
  createdAt: string;
  updatedAt: string;
};

export type UserSessionStatus = {
  authenticated: boolean;
  user: RegisteredUser | null;
};

export type UserRegistrationInput = {
  name: string;
  email: string;
  password: string;
  organization?: string;
  region?: string;
};
''',
    1,
)
contracts.write_text(source, encoding="utf-8")

# ---- API client ----
api = Path("apps/web/src/features/agents/agent-api.ts")
source = api.read_text(encoding="utf-8")
source = source.replace(
    '''  AccountProfile,
  AdminSessionStatus,
  AgentConfigInput,''',
    '''  AccountProfile,
  AdminSessionStatus,
  AgentConfigInput,''',
    1,
)
source = source.replace(
    '''  SystemStatus
} from "@prosmet/contracts";''',
    '''  SystemStatus,
  UserRegistrationInput,
  UserSessionStatus
} from "@prosmet/contracts";''',
    1,
)
source = source.replace(
    '''export function saveAccountProfile(profile: Pick<AccountProfile, "name" | "email" | "organization" | "region">) {
  return requestJson<AccountProfile>("/api/account", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function announceAgentChange() {''',
    '''export function saveAccountProfile(profile: Pick<AccountProfile, "name" | "email" | "organization" | "region">) {
  return requestJson<AccountProfile>("/api/account", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function fetchUserSession() {
  return requestJson<UserSessionStatus>("/api/auth/session");
}

export function registerUser(input: UserRegistrationInput) {
  return requestJson<UserSessionStatus>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function loginUser(email: string, password: string) {
  return requestJson<UserSessionStatus>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function logoutUser() {
  return requestJson<UserSessionStatus>("/api/auth/logout", { method: "DELETE" });
}

export function saveUserProfile(profile: Pick<UserRegistrationInput, "name" | "email" | "organization" | "region">) {
  return requestJson<UserSessionStatus>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function announceAgentChange() {''',
    1,
)
api.write_text(source, encoding="utf-8")

# ---- Server user registration ----
server = Path("apps/web/server.mjs")
source = server.read_text(encoding="utf-8")
source = source.replace("  randomUUID,\n  timingSafeEqual", "  randomUUID,\n  scryptSync,\n  timingSafeEqual", 1)
source = source.replace(
    '''function emptyRegistry() {
  return {
    version: 1,
    activeAgentId: null,
    agents: [],
    profile: null
  };
}''',
    '''function emptyRegistry() {
  return {
    version: 1,
    activeAgentId: null,
    agents: [],
    profile: null,
    users: []
  };
}''',
    1,
)
source = source.replace(
    '''      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null
    };''',
    '''      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
      users: Array.isArray(parsed.users) ? parsed.users.filter((user) => user && typeof user === "object") : []
    };''',
    1,
)
user_helpers = r'''
const userSessionCookieName = "prosmet_user_session";
const userSessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizeEmail(value));
}

function hashPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = scryptSync(String(password), salt, 32).toString("base64url");
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  return constantTimeEqual(hash, user.passwordHash);
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    organization: user.organization || "",
    region: user.region || "",
    role: user.role === "member" ? "member" : "owner",
    createdAt: user.createdAt || user.updatedAt || nowIso(),
    updatedAt: user.updatedAt || user.createdAt || nowIso()
  };
}

function userSessionResponse(user) {
  return { authenticated: Boolean(user), user: sanitizeUser(user) };
}

async function createUserSession(userId) {
  const key = await getEncryptionKey();
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + userSessionMaxAgeSeconds * 1000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function verifyUserSession(value) {
  if (!value) return null;
  const [payload, signature] = String(value).split(".");
  if (!payload || !signature) return null;
  const key = await getEncryptionKey();
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(decoded.exp) <= Date.now()) return null;
    return typeof decoded.userId === "string" ? decoded.userId : null;
  } catch {
    return null;
  }
}

function sessionCookieOptions(request, maxAge = userSessionMaxAgeSeconds) {
  const host = String(request.headers.host || "").toLowerCase();
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local ? "" : "; Secure"}`;
}

async function currentUser(request) {
  const userId = await verifyUserSession(cookieValue(request, userSessionCookieName));
  if (!userId) return null;
  const registry = await loadRegistry();
  return registry.users.find((user) => user.id === userId) || null;
}

'''
source = source.replace(
    '''async function isAdmin(request) {''',
    user_helpers + '''async function isAdmin(request) {''',
    1,
)
user_routes = r'''
  if (url.pathname === "/api/auth/session") {
    if (request.method === "GET") {
      return sendJson(response, 200, userSessionResponse(await currentUser(request)));
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(request);
    const name = optionalString(body.name, 160);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const organization = optionalString(body.organization, 240) || "";
    const region = optionalString(body.region, 240) || "";
    if (!name || !validEmail(email) || password.length < 8) {
      return sendError(response, 400, "REGISTRATION_INVALID", "Укажите имя, корректный email и пароль от 8 символов.");
    }
    const created = await mutateRegistry((registry) => {
      if (registry.users.some((user) => normalizeEmail(user.email) === email)) {
        const error = new Error("Пользователь с таким email уже зарегистрирован.");
        error.code = "USER_EXISTS";
        throw error;
      }
      const passwordValue = hashPassword(password);
      const user = {
        id: randomUUID(),
        name,
        email,
        organization,
        region,
        role: registry.users.length ? "member" : "owner",
        passwordHash: passwordValue.hash,
        passwordSalt: passwordValue.salt,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      registry.users.push(user);
      if (!registry.profile) {
        registry.profile = {
          name,
          email,
          organization,
          region,
          role: "super_admin",
          updatedAt: nowIso()
        };
      }
      return user;
    });
    const session = await createUserSession(created.id);
    return sendJson(response, 201, userSessionResponse(created), {
      "set-cookie": `${userSessionCookieName}=${encodeURIComponent(session)}; ${sessionCookieOptions(request)}`
    });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const registry = await loadRegistry();
    const user = registry.users.find((entry) => normalizeEmail(entry.email) === email) || null;
    if (!user || !verifyPassword(password, user)) {
      return sendError(response, 401, "LOGIN_INVALID", "Неверный email или пароль.");
    }
    const session = await createUserSession(user.id);
    return sendJson(response, 200, userSessionResponse(user), {
      "set-cookie": `${userSessionCookieName}=${encodeURIComponent(session)}; ${sessionCookieOptions(request)}`
    });
  }

  if (request.method === "PUT" && url.pathname === "/api/auth/profile") {
    const active = await currentUser(request);
    if (!active) return sendError(response, 401, "USER_REQUIRED", "Войдите в аккаунт ProSmet.");
    const body = await readJsonBody(request);
    const name = optionalString(body.name, 160);
    const email = normalizeEmail(body.email);
    const organization = optionalString(body.organization, 240) || "";
    const region = optionalString(body.region, 240) || "";
    if (!name || !validEmail(email)) {
      return sendError(response, 400, "PROFILE_INVALID", "Укажите имя и корректный email.");
    }
    const updated = await mutateRegistry((registry) => {
      if (registry.users.some((user) => user.id !== active.id && normalizeEmail(user.email) === email)) {
        const error = new Error("Пользователь с таким email уже зарегистрирован.");
        error.code = "USER_EXISTS";
        throw error;
      }
      const user = registry.users.find((entry) => entry.id === active.id);
      if (!user) return null;
      user.name = name;
      user.email = email;
      user.organization = organization;
      user.region = region;
      user.updatedAt = nowIso();
      return user;
    });
    if (!updated) return sendError(response, 404, "USER_NOT_FOUND", "Пользователь не найден.");
    return sendJson(response, 200, userSessionResponse(updated));
  }

  if (request.method === "DELETE" && url.pathname === "/api/auth/profile") {
    const active = await currentUser(request);
    if (!active) return sendJson(response, 200, userSessionResponse(null), {
      "set-cookie": `${userSessionCookieName}=; ${sessionCookieOptions(request, 0)}`
    });
    await mutateRegistry((registry) => {
      registry.users = registry.users.filter((user) => user.id !== active.id);
      return null;
    });
    return sendJson(response, 200, userSessionResponse(null), {
      "set-cookie": `${userSessionCookieName}=; ${sessionCookieOptions(request, 0)}`
    });
  }

  if (request.method === "DELETE" && url.pathname === "/api/auth/logout") {
    return sendJson(response, 200, userSessionResponse(null), {
      "set-cookie": `${userSessionCookieName}=; ${sessionCookieOptions(request, 0)}`
    });
  }

'''
source = source.replace(
    '''  if (url.pathname === "/api/admin/session") {''',
    user_routes + '''  if (url.pathname === "/api/admin/session") {''',
    1,
)
server.write_text(source, encoding="utf-8")

# ---- PDFMake module declarations ----
Path("apps/web/src/types").mkdir(parents=True, exist_ok=True)
Path("apps/web/src/types/pdfmake-build.d.ts").write_text('''declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    vfs?: Record<string, string>;
    createPdf: (definition: unknown) => { download: (filename: string) => void };
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const pdfFonts: {
    vfs?: Record<string, string>;
    pdfMake?: { vfs?: Record<string, string> };
  };
  export default pdfFonts;
}
''', encoding="utf-8")

# ---- Estimate editor exports ----
estimate_editor = Path("apps/web/src/features/estimate/EstimateEditor.tsx")
source = estimate_editor.read_text(encoding="utf-8")
source = source.replace(
    '''import {
  ArrowLeftIcon,
  CopyIcon,''',
    '''import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CopyIcon,''',
    1,
)
source = source.replace(
    '''  const calculation = useMemo(() => calculateEstimate(estimate), [estimate]);
  const [shareOpen, setShareOpen] = useState(false);''',
    '''  const calculation = useMemo(() => calculateEstimate(estimate), [estimate]);
  const [shareOpen, setShareOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const runExport = async (kind: "pdf" | "excel", operation: () => void | Promise<void>) => {
    setExporting(kind);
    setExportMessage(null);
    try {
      await operation();
      setExportMessage(kind === "pdf" ? "PDF сформирован и отправлен в загрузки." : "Excel сформирован в фирменных цветах.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Экспорт не выполнен");
    } finally {
      setExporting(null);
    }
  };''',
    1,
)
source = source.replace(
    '''    onPrint: () => printEstimate(estimate, calculation),
    onExcel: () => downloadExcel(estimate, calculation)''',
    '''    onPrint: () => void runExport("pdf", () => downloadPdf(estimate, calculation)),
    onExcel: () => void runExport("excel", () => downloadExcel(estimate, calculation)),
    exporting,
    exportMessage''',
    1,
)
source = source.replace(
    '''  onPrint: () => void;
  onExcel: () => void;''',
    '''  onPrint: () => void;
  onExcel: () => void;
  exporting: "pdf" | "excel" | null;
  exportMessage: string | null;''',
    1,
)
source = source.replace(
    '''  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel } = props;''',
    '''  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel, exporting, exportMessage } = props;''',
    1,
)
source = source.replace(
    '''          <button type="button" className="icon-button" aria-label="Печать или PDF" onClick={onPrint}><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel}><FileSpreadsheetIcon /></button>''',
    '''          <button type="button" className="icon-button" aria-label="Скачать PDF" onClick={onPrint} disabled={exporting === "pdf"}><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel} disabled={exporting === "excel"}><FileSpreadsheetIcon /></button>''',
    1,
)
source = source.replace(
    '''          <p>Сохранение версии, утверждение и передача клиенту — три разных действия.</p>''',
    '''          {exportMessage ? <p className="export-status"><CheckCircle2Icon /> {exportMessage}</p> : <p>Сохранение версии, утверждение и передача клиенту — три разных действия.</p>}''',
    1,
)
source = source.replace(
    '''function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver } = props;''',
    '''function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel, exporting, exportMessage } = props;''',
    1,
)
source = source.replace(
    '''        <details className="mobile-meta">''',
    '''        <div className="mobile-export-actions" aria-label="Экспорт сметы">
          <button type="button" onClick={onPrint} disabled={exporting === "pdf"} aria-label="Скачать PDF">
            <FileTextIcon /><span><strong>{exporting === "pdf" ? "Готовим PDF" : "PDF"}</strong><small>Фирменная форма</small></span>
          </button>
          <button type="button" onClick={onExcel} disabled={exporting === "excel"} aria-label="Скачать Excel">
            <FileSpreadsheetIcon /><span><strong>{exporting === "excel" ? "Готовим Excel" : "Excel"}</strong><small>Цветная таблица</small></span>
          </button>
        </div>
        {exportMessage ? <p className="mobile-export-status" role="status"><CheckCircle2Icon /> {exportMessage}</p> : null}

        <details className="mobile-meta">''',
    1,
)
source = source.replace(
    '''function downloadExcel(estimate: Estimate, calculation: Calculation) {
  const rows = estimate.sections.flatMap((section) => [
    `<tr><th colspan="6">${escapeHtml(section.title)}</th></tr>`,
    ...section.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit)}</td><td>${item.quantity}</td><td>${item.unitPrice}</td><td>${calculation.itemTotals[item.id] ?? 0}</td><td>${escapeHtml(item.category)}</td></tr>`)
  ]).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><tr><th>Наименование</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th><th>Категория</th></tr>${rows}<tr><th colspan="4">Итого</th><th>${calculation.total}</th><th></th></tr></table></body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFileName(estimate.title)}-v${estimate.revision}.xls`);
}

function printEstimate(estimate: Estimate, calculation: Calculation) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Браузер заблокировал окно печати");
  const rows = estimate.sections.flatMap((section) => [
    `<tr class="section"><th colspan="5">${escapeHtml(section.title)}</th></tr>`,
    ...section.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit)}</td><td>${item.quantity}</td><td>${item.unitPrice.toLocaleString("ru-RU")} ₽</td><td>${formatMoney(calculation.itemTotals[item.id] ?? 0)}</td></tr>`)
  ]).join("");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(estimate.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:32px;color:#171719}h1{font-size:24px;margin:0 0 8px}p{color:#666;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.section th{padding-top:14px;background:#eee}.total{margin-top:20px;text-align:right;font-size:20px;font-weight:700}@page{size:A4;margin:16mm}</style></head><body><h1>${escapeHtml(estimate.title)}</h1><p>${escapeHtml(estimate.project)}</p><p>${escapeHtml(estimate.customer)} · ${escapeHtml(estimate.region)}</p><table><thead><tr><th>Наименование</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Итого: ${formatMoney(calculation.total)}</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`);
  popup.document.close();
}
''',
    r'''const brand = {
  ink: "#102033",
  blue: "#0A84FF",
  teal: "#14B8A6",
  mint: "#E8FFF7",
  soft: "#F4F8FF",
  line: "#C9D7EA",
  muted: "#617085"
};

type PdfMakeRuntime = {
  vfs?: Record<string, string>;
  createPdf: (definition: unknown) => { download: (filename: string) => void };
};

async function loadPdfMake() {
  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as PdfMakeRuntime;
  const fonts = (pdfFontsModule.default ?? pdfFontsModule) as { vfs?: Record<string, string>; pdfMake?: { vfs?: Record<string, string> } };
  pdfMake.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? pdfMake.vfs;
  return pdfMake;
}

async function downloadPdf(estimate: Estimate, calculation: Calculation) {
  const pdfMake = await loadPdfMake();
  const body = [
    [
      { text: "№", style: "tableHead" },
      { text: "Наименование", style: "tableHead" },
      { text: "Ед.", style: "tableHead", alignment: "center" },
      { text: "Кол-во", style: "tableHead", alignment: "right" },
      { text: "Цена", style: "tableHead", alignment: "right" },
      { text: "Сумма", style: "tableHead", alignment: "right" }
    ],
    ...estimate.sections.flatMap((section) => [
      [{ text: section.title, colSpan: 6, style: "sectionRow" }, {}, {}, {}, {}, {}],
      ...section.items.map((item, index) => [
        { text: String(index + 1), color: brand.muted },
        item.name,
        { text: item.unit, alignment: "center" },
        { text: formatQuantity(item.quantity), alignment: "right" },
        { text: moneyPlain(item.unitPrice), alignment: "right" },
        { text: moneyPlain(calculation.itemTotals[item.id] ?? 0), alignment: "right", bold: true }
      ])
    ]),
    [{ text: "Итого", colSpan: 5, alignment: "right", bold: true, fillColor: brand.soft }, {}, {}, {}, {}, { text: moneyPlain(calculation.total), alignment: "right", bold: true, fillColor: brand.soft }]
  ];

  const definition = {
    pageSize: "A4",
    pageMargins: [34, 38, 34, 34],
    info: { title: estimate.title, author: "ProSmet" },
    defaultStyle: { font: "Roboto", fontSize: 9, color: brand.ink },
    content: [
      {
        columns: [
          { width: "*", stack: [{ text: "ProSmet", style: "brand" }, { text: "AI-смета в фирменной форме", style: "caption" }] },
          { width: 170, text: `Версия ${estimate.revision} · ${statusLabel(estimate.status)}`, style: "status", alignment: "right" }
        ]
      },
      { text: estimate.title, style: "title" },
      { text: [estimate.project, estimate.customer, estimate.region].filter(Boolean).join(" · ") || "Объект не указан", style: "meta" },
      {
        table: {
          widths: [22, "*", 34, 48, 62, 70],
          headerRows: 1,
          body
        },
        layout: {
          hLineColor: () => brand.line,
          vLineColor: () => brand.line,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 5,
          paddingBottom: () => 5
        },
        margin: [0, 18, 0, 0]
      },
      {
        columns: [
          { text: "Документ сформирован в ProSmet. Проверьте исходные данные, договорные условия и реквизиты сторон перед передачей клиенту.", style: "note" },
          {
            width: 190,
            table: {
              widths: ["*", 80],
              body: [
                ["Прямые затраты", moneyPlain(calculation.direct)],
                ["Накладные", moneyPlain(calculation.overhead)],
                ["Прибыль", moneyPlain(calculation.profit)],
                ["НДС", moneyPlain(calculation.vat)],
                [{ text: "Итого", bold: true }, { text: moneyPlain(calculation.total), bold: true }]
              ]
            },
            layout: "lightHorizontalLines"
          }
        ],
        columnGap: 24,
        margin: [0, 18, 0, 0]
      }
    ],
    styles: {
      brand: { fontSize: 17, bold: true, color: brand.blue, margin: [0, 0, 0, 2] },
      caption: { fontSize: 8, color: brand.muted },
      status: { fontSize: 8, color: brand.teal },
      title: { fontSize: 22, bold: true, color: brand.ink, margin: [0, 22, 0, 4] },
      meta: { fontSize: 9, color: brand.muted },
      tableHead: { fillColor: brand.blue, color: "#FFFFFF", bold: true, fontSize: 8 },
      sectionRow: { fillColor: brand.mint, color: brand.ink, bold: true, fontSize: 9 },
      note: { color: brand.muted, fontSize: 8, lineHeight: 1.35 }
    }
  };
  pdfMake.createPdf(definition).download(`${safeFileName(estimate.title)}-v${estimate.revision}.pdf`);
}

function downloadExcel(estimate: Estimate, calculation: Calculation) {
  const rows = estimate.sections.flatMap((section) => [
    `<tr class="section"><th colspan="6">${escapeHtml(section.title)}</th></tr>`,
    ...section.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td class="center">${escapeHtml(item.unit)}</td><td class="number">${formatQuantity(item.quantity)}</td><td class="number">${item.unitPrice}</td><td class="number strong">${calculation.itemTotals[item.id] ?? 0}</td><td>${categoryLabel(item.category)}</td></tr>`)
  ]).join("");
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}.brand{background:${brand.blue};color:#fff;font-size:18px;font-weight:700}.meta{background:${brand.mint};color:${brand.ink}}table{border-collapse:collapse;width:100%}th,td{border:1px solid ${brand.line};padding:8px}th{background:${brand.blue};color:#fff;font-weight:700}.section th{background:${brand.mint};color:${brand.ink};font-size:14px}.number{text-align:right;mso-number-format:"0\\ #,##0"}.center{text-align:center}.strong{font-weight:700}.total th,.total td{background:${brand.soft};font-weight:700;font-size:14px}</style></head><body><table><tr><td class="brand" colspan="6">ProSmet · ${escapeHtml(estimate.title)}</td></tr><tr><td class="meta" colspan="6">${escapeHtml([estimate.project, estimate.customer, estimate.region].filter(Boolean).join(" · "))}</td></tr><tr><th>Наименование</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th><th>Категория</th></tr>${rows}<tr class="total"><th colspan="4">Итого</th><td class="number">${calculation.total}</td><td></td></tr></table></body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFileName(estimate.title)}-v${estimate.revision}.xls`);
}
''',
    1,
)
source = source.replace(
    '''function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}''',
    '''function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}''',
    1,
)
source = source.replace(
    '''function safeFileName(value: string) {''',
    '''function moneyPlain(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function categoryLabel(value: EstimateItem["category"]) {
  return ({ work: "Работы", material: "Материалы", equipment: "Оборудование", logistics: "Логистика" })[value];
}

function safeFileName(value: string) {''',
    1,
)
estimate_editor.write_text(source, encoding="utf-8")

# ---- Account view ----
Path("apps/web/src/features/account/AccountView.tsx").write_text(r'''import { useEffect, useState } from "react";
import type { AccountProfile, SystemStatus, UserRegistrationInput, UserSessionStatus } from "@prosmet/contracts";
import {
  BotIcon,
  Building2Icon,
  CheckCircle2Icon,
  DatabaseIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
  LogOutIcon,
  SaveIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UserRoundIcon
} from "lucide-react";
import {
  fetchAccountProfile,
  fetchSystemStatus,
  fetchUserSession,
  loginUser,
  logoutUser,
  registerUser,
  saveAccountProfile,
  saveUserProfile
} from "../agents/agent-api";

const emptyProfile: AccountProfile = {
  name: "",
  email: "",
  organization: "",
  region: "",
  role: "super_admin",
  updatedAt: ""
};

const emptyUserForm: UserRegistrationInput = {
  name: "",
  email: "",
  password: "",
  organization: "",
  region: ""
};

type AuthMode = "register" | "login";

export function AccountView({ mobile }: { mobile: boolean }) {
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [userForm, setUserForm] = useState<UserRegistrationInput>(emptyUserForm);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [userSession, setUserSession] = useState<UserSessionStatus>({ authenticated: false, user: null });
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [systemStatus, sessionStatus] = await Promise.all([
        fetchSystemStatus().catch(() => null),
        fetchUserSession().catch(() => ({ authenticated: false, user: null } as UserSessionStatus))
      ]);
      if (!cancelled) {
        setSystem(systemStatus);
        setUserSession(sessionStatus);
        if (sessionStatus.user) {
          setUserForm({
            name: sessionStatus.user.name,
            email: sessionStatus.user.email,
            password: "",
            organization: sessionStatus.user.organization,
            region: sessionStatus.user.region
          });
        }
      }
      try {
        const account = await fetchAccountProfile();
        if (!cancelled) {
          setProfile(account);
          setAuthorized(true);
        }
      } catch {
        if (!cancelled) setAuthorized(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await saveAccountProfile(profile);
      setProfile(updated);
      setAuthorized(true);
      setMessage("Профиль организации сохранён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setMessage(null);
    try {
      const session = authMode === "register"
        ? await registerUser(userForm)
        : await loginUser(userForm.email, userForm.password);
      setUserSession(session);
      if (session.user) {
        setUserForm({
          name: session.user.name,
          email: session.user.email,
          password: "",
          organization: session.user.organization,
          region: session.user.region
        });
      }
      setMessage(authMode === "register" ? "Аккаунт создан. Можно сохранять профиль и работать с проектами." : "Вход выполнен.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setMessage(null);
    try {
      const session = await saveUserProfile(userForm);
      setUserSession(session);
      setMessage("Данные пользователя сохранены.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить пользователя");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    setMessage(null);
    try {
      const session = await logoutUser();
      setUserSession(session);
      setUserForm(emptyUserForm);
      setMessage("Вы вышли из аккаунта.");
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <section className={mobile ? "account mobile-account" : "account desktop-account"}>
      <header className="section-title">
        <h1>Кабинет</h1>
        <p>Регистрация пользователей, профиль организации, состояние сервера и активная интеграция.</p>
      </header>

      <section className="account-auth-card">
        {userSession.authenticated && userSession.user ? (
          <form className="account-user-form" onSubmit={saveUser}>
            <div className="profile-panel real-profile-panel branded-profile-panel">
              <div className="profile-avatar"><UserRoundIcon /></div>
              <div>
                <strong>{userSession.user.name || "Пользователь ProSmet"}</strong>
                <span>{userSession.user.email} · {userSession.user.role === "owner" ? "владелец" : "участник"}</span>
              </div>
              <button type="button" onClick={() => void logout()} disabled={authBusy}><LogOutIcon /> Выйти</button>
            </div>
            <div className="account-fields">
              <AccountField id="user-name" label="Имя"><input id="user-name" name="user-name" value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></AccountField>
              <AccountField id="user-email" label="Электронная почта"><input id="user-email" name="user-email" type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></AccountField>
              <AccountField id="user-organization" label="Организация"><input id="user-organization" name="user-organization" value={userForm.organization || ""} onChange={(event) => setUserForm((current) => ({ ...current, organization: event.target.value }))} autoComplete="organization" /></AccountField>
              <AccountField id="user-region" label="Регион"><input id="user-region" name="user-region" value={userForm.region || ""} onChange={(event) => setUserForm((current) => ({ ...current, region: event.target.value }))} /></AccountField>
            </div>
            <button className="account-submit-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircleIcon className="spin" /> : <SaveIcon />} Сохранить пользователя</button>
          </form>
        ) : (
          <form className="account-registration-form" onSubmit={submitAuth}>
            <div className="account-auth-heading">
              <span>{authMode === "register" ? <UserPlusIcon /> : <KeyRoundIcon />}</span>
              <div>
                <h2>{authMode === "register" ? "Создать аккаунт ProSmet" : "Войти в аккаунт"}</h2>
                <p>Аккаунт нужен для профиля, будущих ролей команды и сохранения настроек пользователя.</p>
              </div>
            </div>
            <div className="account-fields">
              {authMode === "register" ? <AccountField id="register-name" label="Имя"><input id="register-name" name="register-name" required value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></AccountField> : null}
              <AccountField id="register-email" label="Электронная почта"><input id="register-email" name="register-email" type="email" required value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></AccountField>
              <AccountField id="register-password" label="Пароль"><input id="register-password" name="register-password" type="password" required minLength={8} value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></AccountField>
              {authMode === "register" ? (
                <>
                  <AccountField id="register-organization" label="Организация"><input id="register-organization" name="register-organization" value={userForm.organization || ""} onChange={(event) => setUserForm((current) => ({ ...current, organization: event.target.value }))} autoComplete="organization" /></AccountField>
                  <AccountField id="register-region" label="Регион"><input id="register-region" name="register-region" value={userForm.region || ""} onChange={(event) => setUserForm((current) => ({ ...current, region: event.target.value }))} /></AccountField>
                </>
              ) : null}
            </div>
            <div className="account-auth-actions">
              <button className="account-submit-button" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircleIcon className="spin" /> : authMode === "register" ? <UserPlusIcon /> : <LogInIcon />} {authMode === "register" ? "Создать аккаунт" : "Войти"}</button>
              <button type="button" onClick={() => setAuthMode((mode) => mode === "register" ? "login" : "register")}>{authMode === "register" ? "Уже есть аккаунт" : "Нужна регистрация"}</button>
            </div>
          </form>
        )}
      </section>

      {authorized === false ? (
        <div className="account-auth-required soft-auth-note">
          <ShieldCheckIcon />
          <div><strong>Супер-админ нужен только для технических ключей</strong><p>Пользовательский аккаунт работает отдельно. Для настройки агентов войдите в разделе «Настройки».</p></div>
        </div>
      ) : authorized === true ? (
        <form className="account-profile-form" onSubmit={save}>
          <div className="profile-panel real-profile-panel">
            <div className="profile-avatar"><UserRoundIcon /></div>
            <div>
              <strong>{profile.name || "Профиль организации не заполнен"}</strong>
              <span>{profile.email || "Укажите имя, организацию и контакт"}</span>
            </div>
            <button type="submit" disabled={saving}>{saving ? <LoaderCircleIcon className="spin" /> : <SaveIcon />} Сохранить</button>
          </div>

          <div className="account-fields">
            <AccountField id="profile-name" label="Имя"><input id="profile-name" name="profile-name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} autoComplete="name" /></AccountField>
            <AccountField id="profile-email" label="Электронная почта"><input id="profile-email" name="profile-email" type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></AccountField>
            <AccountField id="profile-organization" label="Организация"><input id="profile-organization" name="profile-organization" value={profile.organization} onChange={(event) => setProfile((current) => ({ ...current, organization: event.target.value }))} autoComplete="organization" /></AccountField>
            <AccountField id="profile-region" label="Регион"><input id="profile-region" name="profile-region" value={profile.region} onChange={(event) => setProfile((current) => ({ ...current, region: event.target.value }))} /></AccountField>
          </div>
        </form>
      ) : null}
      {message ? <p className="account-save-message" role="status">{message}</p> : null}

      <div className="account-grid live-account-grid">
        <article className="account-card">
          <span className="account-card-icon"><Building2Icon /></span>
          <div><small>Организация</small><h2>{userSession.user?.organization || profile.organization || "Не настроена"}</h2><p>{userSession.user?.region || profile.region || "Регион не указан"}</p></div>
        </article>
        <article className="account-card">
          <span className="account-card-icon"><BotIcon /></span>
          <div><small>Активный агент</small><h2>{system?.activeAgent?.name || "Не подключён"}</h2><p>{system?.activeAgent ? `${system.activeAgent.type}${system.activeAgent.model ? ` · ${system.activeAgent.model}` : ""}` : "Откройте настройки агентов"}</p></div>
        </article>
      </div>

      <div className="account-block">
        <div className="account-block-title"><h2>Состояние системы</h2><span>{system?.ok ? <><CheckCircle2Icon /> Доступна</> : "Нет соединения"}</span></div>
        <div className="status-row"><span><DatabaseIcon /> Хранилище конфигурации</span><b>{system?.persistence || "неизвестно"}</b></div>
        <div className="status-row"><span><BotIcon /> Подключено агентов</span><b>{system?.configuredAgents ?? 0}</b></div>
        <div className="status-row"><span><ShieldCheckIcon /> Пользователь</span><b>{userSession.user ? userSession.user.role : "не зарегистрирован"}</b></div>
        <div className="status-row"><span>Версия production</span><b className="release-sha">{system?.releaseSha || "недоступно"}</b></div>
      </div>
    </section>
  );
}

function AccountField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <label className="account-field" htmlFor={id}><span>{label}</span>{children}</label>;
}
''', encoding="utf-8")

# ---- Mobile brand polish CSS ----
Path("apps/web/src/mobile-brand-polish.css").write_text(r''':root {
  --brand-blue: #0A84FF;
  --brand-cyan: #24C8DB;
  --brand-teal: #14B8A6;
  --brand-mint: #E8FFF7;
  --brand-sky: #EAF4FF;
  --brand-amber: #F59E0B;
  --brand-ink: #102033;
}

.export-status { display: flex; align-items: center; gap: 7px; color: var(--success) !important; }
.export-status svg { width: 15px; height: 15px; }

@media (max-width: 767px) {
  .pro-mobile-root { background: radial-gradient(circle at 14% 10%, rgba(10,132,255,.22), transparent 26%), radial-gradient(circle at 88% 0%, rgba(36,200,219,.18), transparent 28%), #eef5ff; }
  .pro-mobile-stage { background: linear-gradient(180deg,#ffffff 0%,#f7fbff 62%,#f4f8ff 100%); }
  .pro-mobile-drawer { background: linear-gradient(180deg,#ffffff 0%,#f4fbff 100%); }
  .pro-mobile-drawer > header > div > span,
  .pro-brand > span:first-child,
  .brand-mark,
  .mobile-brand > span { background: linear-gradient(135deg,var(--brand-blue),var(--brand-teal)); box-shadow: 0 12px 30px rgba(10,132,255,.24); }
  .pro-mobile-drawer > nav > button.active { background: linear-gradient(90deg,rgba(10,132,255,.14),rgba(20,184,166,.12)); color: var(--brand-ink); }
  .pro-mobile-drawer > nav > button.active svg { color: var(--brand-blue); }
  .pro-mobile-drawer > footer > button:first-child,
  .pro-view-mobile .pro-primary-action,
  .mobile-primary-action,
  .primary-button { border: 0; background: linear-gradient(135deg,var(--brand-blue),var(--brand-teal)); color: #fff; box-shadow: 0 16px 34px rgba(10,132,255,.22); }
  .pro-mobile-topbar { background: linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.84)); backdrop-filter: blur(18px) saturate(145%); }
  .pro-mobile-topbar > button,
  .chat-reference-menu,
  .chat-reference-voice,
  .chat-reference-chat-actions > button { border-color: rgba(10,132,255,.18) !important; background: #fff !important; color: var(--brand-ink) !important; box-shadow: 0 12px 28px rgba(10,32,51,.08) !important; }
  .chat-reference-title { color: var(--brand-ink); }

  .mobile-estimate-editor { background: linear-gradient(180deg,#f6fbff 0%,#eef6ff 100%); }
  .mobile-estimate-topbar { background: linear-gradient(135deg,var(--brand-ink),#173a67 55%,#0a84ff); color: #fff; border-bottom: 0; box-shadow: 0 18px 44px rgba(10,32,51,.24); }
  .mobile-estimate-topbar button { background: rgba(255,255,255,.14) !important; color: #fff !important; border-color: rgba(255,255,255,.22) !important; }
  .mobile-estimate-hero { position: relative; overflow: hidden; border: 0; background: linear-gradient(135deg,#102033 0%,#0A84FF 58%,#14B8A6 100%); color: #fff; box-shadow: 0 24px 58px rgba(10,132,255,.25); }
  .mobile-estimate-hero::after { content: ""; position: absolute; width: 160px; height: 160px; right: -52px; top: -58px; border-radius: 50%; background: rgba(255,255,255,.16); }
  .mobile-estimate-hero .status { background: rgba(255,255,255,.18); color: #fff; }
  .mobile-estimate-hero p { color: rgba(255,255,255,.78); }
  .mobile-estimate-hero div strong { color: #fff; }
  .mobile-export-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 14px; }
  .mobile-export-actions button { min-height: 74px; display: grid; grid-template-columns: 38px minmax(0,1fr); align-items: center; gap: 9px; border: 1px solid rgba(10,132,255,.14); border-radius: 20px; background: rgba(255,255,255,.92); padding: 12px; color: var(--brand-ink); text-align: left; box-shadow: 0 14px 34px rgba(10,32,51,.08); }
  .mobile-export-actions button:first-child { background: linear-gradient(135deg,#fff,var(--brand-sky)); }
  .mobile-export-actions button:last-child { background: linear-gradient(135deg,#fff,var(--brand-mint)); }
  .mobile-export-actions svg { width: 24px; height: 24px; color: var(--brand-blue); }
  .mobile-export-actions strong,
  .mobile-export-actions small { display: block; }
  .mobile-export-actions strong { font-size: 14px; letter-spacing: -.02em; }
  .mobile-export-actions small { margin-top: 3px; color: #617085; font-size: 10px; }
  .mobile-export-status { display: flex; align-items: center; gap: 7px; margin: 0 14px 12px; border-radius: 14px; background: rgba(20,184,166,.12); padding: 10px 12px; color: #0f766e; font-size: 12px; font-weight: 700; }
  .mobile-export-status svg { width: 17px; height: 17px; }
  .mobile-meta,
  .mobile-estimate-section,
  .mobile-price-summary { border-color: rgba(10,132,255,.10) !important; background: rgba(255,255,255,.92) !important; box-shadow: 0 16px 36px rgba(10,32,51,.07); }
  .mobile-estimate-section > header strong,
  .mobile-price-summary h2,
  .mobile-grand-total strong { color: var(--brand-blue); }
  .mobile-estimate-item { position: relative; overflow: hidden; border-color: rgba(10,132,255,.12) !important; box-shadow: 0 12px 30px rgba(10,32,51,.06); }
  .mobile-estimate-item::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(180deg,var(--brand-blue),var(--brand-teal)); }
  .mobile-item-head > span { background: var(--brand-sky) !important; color: var(--brand-blue) !important; }
  .mobile-item-fields label div { border-color: rgba(10,132,255,.15) !important; background: #f8fbff !important; }
  .mobile-add-position { border-color: rgba(10,132,255,.18) !important; background: linear-gradient(135deg,#fff,var(--brand-sky)) !important; color: var(--brand-blue) !important; }
  .mobile-estimate-actions { border-top: 0; background: rgba(255,255,255,.86); backdrop-filter: blur(20px) saturate(155%); box-shadow: 0 -14px 36px rgba(10,32,51,.10); }
  .mobile-share-button,
  .mobile-secondary-action { border-color: rgba(10,132,255,.16) !important; background: #fff !important; color: var(--brand-ink) !important; }

  .account-auth-card,
  .account-profile-form,
  .account-user-form,
  .account-registration-form { border: 1px solid rgba(10,132,255,.12); border-radius: 24px; background: linear-gradient(180deg,#fff,#f6fbff); padding: 16px; box-shadow: 0 18px 42px rgba(10,32,51,.08); }
  .account-auth-card { margin-bottom: 14px; }
  .account-auth-heading { display: grid; grid-template-columns: 46px minmax(0,1fr); gap: 12px; align-items: center; margin-bottom: 14px; }
  .account-auth-heading > span { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(135deg,var(--brand-blue),var(--brand-teal)); color: #fff; }
  .account-auth-heading h2 { margin: 0; font-size: 21px; line-height: 1.15; letter-spacing: -.04em; }
  .account-auth-heading p { margin: 5px 0 0; color: #617085; font-size: 12px; line-height: 1.45; }
  .branded-profile-panel { background: linear-gradient(135deg,var(--brand-ink),#0A84FF) !important; color: #fff; }
  .branded-profile-panel span { color: rgba(255,255,255,.76) !important; }
  .account-auth-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 12px; }
  .account-auth-actions > button:last-child { border: 0; background: transparent; color: var(--brand-blue); font-weight: 800; }
  .account-submit-button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 15px; background: linear-gradient(135deg,var(--brand-blue),var(--brand-teal)); padding: 0 16px; color: #fff; font-weight: 800; box-shadow: 0 16px 32px rgba(10,132,255,.22); }
  .soft-auth-note { background: rgba(10,132,255,.08) !important; border-color: rgba(10,132,255,.15) !important; }
}
''', encoding="utf-8")

# Import polish css.
app_entry = Path("apps/web/src/app/AppEntry.tsx")
source = app_entry.read_text(encoding="utf-8")
if 'import "../mobile-brand-polish.css";' not in source:
    source = source.replace('import "../professional-polish-v2.css";\n', 'import "../professional-polish-v2.css";\nimport "../mobile-brand-polish.css";\n', 1)
app_entry.write_text(source, encoding="utf-8")

# ---- Tests ----
e2e = Path("apps/web/e2e/app.spec.ts")
source = e2e.read_text(encoding="utf-8")
source = source.replace('import { mkdir, writeFile } from "node:fs/promises";', 'import { mkdir, stat, writeFile } from "node:fs/promises";', 1)
source = source.replace(
    '''  const saveResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
    response.request().method() === "PUT"
  );''',
    '''  const pdfDownloadPromise = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Скачать PDF" }).first().click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfPath = await pdfDownload.path();
  if (pdfPath) expect((await stat(pdfPath)).size).toBeGreaterThan(5000);

  const excelDownloadPromise = page.waitForEvent("download");
  await editor.getByRole("button", { name: "Скачать Excel" }).first().click();
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toMatch(/\.xls$/);
  const excelPath = await excelDownload.path();
  if (excelPath) expect((await stat(excelPath)).size).toBeGreaterThan(1000);

  const saveResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
    response.request().method() === "PUT"
  );''',
    1,
)
source += r'''

test("registers a real user account and keeps the account UI branded", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const email = `qa-${unique}@example.com`;

  await page.goto("/", { waitUntil: "networkidle" });
  if (testInfo.project.name === "mobile-chromium") {
    const menu = await openMobileMenu(page);
    await menu.getByRole("button", { name: /Профиль/ }).click();
  } else {
    await page.getByRole("button", { name: /Кабинет/ }).click();
  }

  await expect(page.getByRole("heading", { name: "Кабинет" })).toBeVisible();
  await page.getByRole("textbox", { name: "Имя" }).first().fill("QA Пользователь");
  await page.getByRole("textbox", { name: "Электронная почта" }).first().fill(email);
  await page.getByLabel("Пароль").fill("prosmet-qa-2026");
  await page.getByRole("textbox", { name: "Организация" }).first().fill("QA Строй");
  await page.getByRole("textbox", { name: "Регион" }).first().fill("Республика Татарстан");

  const registerResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/auth/register" && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  const registerResponse = await registerResponsePromise;
  expect(registerResponse.status()).toBe(201);
  await expect(page.getByText("Аккаунт создан", { exact: false })).toBeVisible();
  await expect(page.getByText(email, { exact: false })).toBeVisible();

  const sessionResponse = await page.request.get("/api/auth/session");
  expect(sessionResponse.ok(), await sessionResponse.text()).toBeTruthy();
  const session = await sessionResponse.json() as { authenticated?: boolean; user?: { email?: string } | null };
  expect(session.authenticated).toBe(true);
  expect(session.user?.email).toBe(email);

  const cleanupResponse = await page.request.delete("/api/auth/profile");
  expect(cleanupResponse.ok(), await cleanupResponse.text()).toBeTruthy();
});
'''
e2e.write_text(source, encoding="utf-8")

# ---- Contract gates ----
contract = Path("scripts/greenfield-contract.mjs")
source = contract.read_text(encoding="utf-8")
source = source.replace(
    '  "apps/web/src/mobile-navigation.css",',
    '  "apps/web/src/mobile-navigation.css",\n  "apps/web/src/mobile-brand-polish.css",\n  "apps/web/src/types/pdfmake-build.d.ts",',
    1,
)
source = source.replace(
    'const webEstimate = await read("apps/web/src/features/estimate/EstimateEditor.tsx");',
    'const webEstimate = await read("apps/web/src/features/estimate/EstimateEditor.tsx");\nconst accountView = await read("apps/web/src/features/account/AccountView.tsx");',
    1,
)
guards = r'''
for (const token of ["/api/auth/register", "/api/auth/login", "/api/auth/profile", "prosmet_user_session", "scryptSync"]) {
  if (!server.includes(token)) failures.push(`auth:registration-contract-missing:${token}`);
}
for (const token of ["downloadPdf", "pdfMake.createPdf", "Скачать PDF", "Скачать Excel", "Фирменная форма"]) {
  if (!webEstimate.includes(token)) failures.push(`export:branded-export-contract-missing:${token}`);
}
for (const token of ["Создать аккаунт ProSmet", "saveUserProfile", "Аккаунт создан"]) {
  if (!accountView.includes(token)) failures.push(`account:registration-ui-missing:${token}`);
}

'''
marker = "if (failures.length) {"
if guards not in source:
    source = source.replace(marker, guards + marker, 1)
contract.write_text(source, encoding="utf-8")

# Package script/dependency marker is handled by npm install in the workflow. Keep package.json valid.
package_path = Path("package.json")
package_data = json.loads(package_path.read_text(encoding="utf-8"))
package_data.setdefault("scripts", {})
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
