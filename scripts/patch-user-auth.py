from pathlib import Path

path = Path("apps/web/server.mjs")
source = path.read_text(encoding="utf-8")

start = source.index("function boundedUserString")
end = source.index("function calculateEstimateTotals", start)
user_store = r'''const userSessionCookieName = "prosmet_user_session";
const userSessionMaxAgeSeconds = 30 * 24 * 60 * 60;

function boundedUserString(value, maxLength = 320) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function normalizeRegisteredEmail(value) {
  return boundedUserString(value, 320).toLowerCase();
}

function validRegisteredEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || ""));
}

function hashRegisteredPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt.v1.${salt}.${hash}`;
}

function verifyRegisteredPassword(password, encoded) {
  const [scheme, version, salt, expected] = String(encoded || "").split(".");
  if (scheme !== "scrypt" || version !== "v1" || !salt || !expected) return false;
  const actual = hashRegisteredPassword(password, salt).split(".")[3];
  return constantTimeEqual(actual, expected);
}

function createUserStore(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      company TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_registered_users_created
      ON registered_users(created_at DESC);
  `);

  const insertUser = db.prepare(`
    INSERT INTO registered_users (
      id, name, email, company, password_hash, role, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const publicByEmail = db.prepare(`
    SELECT id, name, email, company, role, status, created_at, updated_at
      FROM registered_users WHERE email = ?
  `);
  const publicById = db.prepare(`
    SELECT id, name, email, company, role, status, created_at, updated_at
      FROM registered_users WHERE id = ?
  `);
  const authByEmail = db.prepare(`
    SELECT id, name, email, company, password_hash, role, status, created_at, updated_at
      FROM registered_users WHERE email = ?
  `);
  const listUsers = db.prepare(`
    SELECT id, name, email, company, role, status, created_at, updated_at
      FROM registered_users ORDER BY created_at DESC LIMIT ?
  `);
  const deleteUser = db.prepare("DELETE FROM registered_users WHERE id = ?");

  const publicUser = (row) => row ? ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    company: String(row.company),
    role: String(row.role),
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }) : null;

  function findByEmail(email) {
    return publicUser(publicByEmail.get(email));
  }

  function findById(id) {
    return publicUser(publicById.get(id));
  }

  function authenticate(email, password) {
    const row = authByEmail.get(email);
    if (!row || row.status !== "active" || !verifyRegisteredPassword(password, row.password_hash)) return null;
    return publicUser(row);
  }

  function registerUser(input) {
    const now = nowIso();
    const id = randomUUID();
    insertUser.run(
      id,
      input.name,
      input.email,
      input.company,
      hashRegisteredPassword(input.password),
      "owner",
      "active",
      now,
      now
    );
    return findById(id);
  }

  function users(limit = 100) {
    const boundedLimit = Math.min(500, Math.max(1, Math.floor(asNumber(limit, 100))));
    return listUsers.all(boundedLimit).map(publicUser).filter(Boolean);
  }

  function removeUser(id) {
    return Number(deleteUser.run(id).changes) > 0;
  }

  return {
    authenticate,
    close: () => db.close(),
    findByEmail,
    findById,
    registerUser,
    removeUser,
    users
  };
}

async function createUserSession(userId) {
  const key = await getEncryptionKey();
  const payload = Buffer.from(JSON.stringify({
    userId,
    exp: Date.now() + userSessionMaxAgeSeconds * 1000
  })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function userFromRequest(request) {
  const value = cookieValue(request, userSessionCookieName);
  if (!value) return null;
  const [payload, signature] = String(value).split(".");
  if (!payload || !signature) return null;
  const key = await getEncryptionKey();
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(decoded.exp) <= Date.now()) return null;
    return userStore.findById(String(decoded.userId || ""));
  } catch {
    return null;
  }
}

function userSessionCookie(request, value, maxAge = userSessionMaxAgeSeconds) {
  const host = String(request.headers.host || "").toLowerCase();
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  return `${userSessionCookieName}=${value ? encodeURIComponent(value) : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local ? "" : "; Secure"}`;
}

function userSessionResponse(user) {
  return { authenticated: Boolean(user), user: user || null };
}

'''
source = source[:start] + user_store + source[end:]

route_start = source.index('  if (url.pathname === "/api/register" || url.pathname === "/api/users/register") {')
route_end = source.index('  if (request.method === "GET" && url.pathname === "/api/estimates") {', route_start)
routes = r'''  if (url.pathname === "/api/register" || url.pathname === "/api/users/register") {
    if (request.method !== "POST") return sendError(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await readJsonBody(request);
    const name = boundedUserString(body.name, 160);
    const email = normalizeRegisteredEmail(body.email);
    const company = boundedUserString(body.company, 220);
    const password = String(body.password || "");
    if (!name || !email || !company || !password) {
      return sendError(response, 400, "REGISTRATION_FIELDS_REQUIRED", "Укажите имя, email, компанию и пароль.");
    }
    if (!validRegisteredEmail(email)) {
      return sendError(response, 400, "REGISTRATION_EMAIL_INVALID", "Укажите корректный email.");
    }
    if (password.length < 8 || password.length > 160) {
      return sendError(response, 400, "REGISTRATION_PASSWORD_INVALID", "Пароль должен быть не короче 8 символов.");
    }
    if (userStore.findByEmail(email)) {
      return sendError(response, 409, "REGISTRATION_EMAIL_EXISTS", "Пользователь с таким email уже зарегистрирован.");
    }
    const user = userStore.registerUser({ name, email, company, password });
    const session = await createUserSession(user.id);
    return sendJson(response, 201, userSessionResponse(user), {
      "set-cookie": userSessionCookie(request, session)
    });
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    return sendJson(response, 200, userSessionResponse(await userFromRequest(request)));
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJsonBody(request);
    const user = userStore.authenticate(
      normalizeRegisteredEmail(body.email),
      String(body.password || "")
    );
    if (!user) return sendError(response, 401, "USER_LOGIN_INVALID", "Неверный email или пароль.");
    const session = await createUserSession(user.id);
    return sendJson(response, 200, userSessionResponse(user), {
      "set-cookie": userSessionCookie(request, session)
    });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "DELETE") {
    return sendJson(response, 200, userSessionResponse(null), {
      "set-cookie": userSessionCookie(request, "", 0)
    });
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    if (!(await requireAdmin(request, response))) return;
    return sendJson(response, 200, {
      users: userStore.users(Number(url.searchParams.get("limit") || 100)),
      persistence: "sqlite"
    });
  }

  const registeredUserRoute = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (registeredUserRoute && request.method === "DELETE") {
    if (!(await requireAdmin(request, response))) return;
    const userId = decodeURIComponent(registeredUserRoute[1]);
    if (!userStore.removeUser(userId)) {
      return sendError(response, 404, "REGISTERED_USER_NOT_FOUND", "Пользователь не найден.");
    }
    return sendJson(response, 200, { deleted: true, id: userId });
  }

'''
source = source[:route_start] + routes + source[route_end:]
path.write_text(source, encoding="utf-8")
