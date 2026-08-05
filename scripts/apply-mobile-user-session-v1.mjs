import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one replacement target, found ${count}`);
  await writeFile(path, source.replace(before, after), "utf8");
}

await replaceOnce(
  "packages/contracts/src/index.ts",
  `export type AccountProfile = {
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "super_admin";
  updatedAt: string;
};`,
  `export type AccountProfile = {
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "super_admin";
  updatedAt: string;
};

export type RegisteredUserRole = "owner" | "member";
export type RegisteredUserStatus = "active" | "locked" | "revoked";

export type RegisteredUser = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: RegisteredUserRole;
  status: RegisteredUserStatus;
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
  company: string;
  password: string;
};

export type UserLoginInput = {
  email: string;
  password: string;
};`
);

const mobilePackagePath = "apps/mobile/package.json";
const mobilePackage = JSON.parse(await readFile(mobilePackagePath, "utf8"));
mobilePackage.scripts.test = "vitest run src/domain/user-session.test.ts src/application/user-session.test.ts";
mobilePackage.scripts["test:watch"] = "vitest src/domain/user-session.test.ts src/application/user-session.test.ts";
mobilePackage.scripts["test:coverage"] = "vitest run --coverage src/domain/user-session.test.ts src/application/user-session.test.ts";
mobilePackage.scripts["test:integration"] = "vitest run src/application/user-session.test.ts";
mobilePackage.scripts.verify = "npm run typecheck && npm run test";
await writeFile(mobilePackagePath, `${JSON.stringify(mobilePackage, null, 2)}\n`, "utf8");

const rootPackagePath = "package.json";
const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8"));
rootPackage.scripts.test = "npm run test -w @prosmet/web && npm run test -w @prosmet/mobile && cargo test -p prosmet-estimate-engine";
await writeFile(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8");

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  '  "apps/mobile/src/agent-session.ts",',
  `  "apps/mobile/src/agent-session.ts",
  "apps/mobile/src/application/user-session.ts",
  "apps/mobile/src/application/user-session.test.ts",
  "apps/mobile/src/domain/user-session.ts",
  "apps/mobile/src/domain/user-session.test.ts",`
);

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  'const mobileSession = await read("apps/mobile/src/agent-session.ts");',
  `const mobileSession = await read("apps/mobile/src/agent-session.ts");
const mobileUserSession = await read("apps/mobile/src/application/user-session.ts");
const mobileUserDomain = await read("apps/mobile/src/domain/user-session.ts");`
);

await replaceOnce(
  "scripts/greenfield-contract.mjs",
  'if (!mobileSession.includes("expo-secure-store")) failures.push("native:secure-store-missing");',
  `if (!mobileSession.includes("expo-secure-store")) failures.push("native:secure-store-missing");
for (const token of [
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/register",
  "parseUserSession"
]) {
  if (!mobileUserSession.includes(token)) failures.push(\`native-auth:user-session-gateway-missing:\${token}\`);
}
for (const token of ["validateRegistrationInput", "validateLoginInput", "normalizeUserEmail"]) {
  if (!mobileUserDomain.includes(token)) failures.push(\`native-auth:user-session-domain-missing:\${token}\`);
}
if (!nativeAccount.includes("Создать аккаунт ProSmet") || !nativeAccount.includes("logoutMobileUser")) {
  failures.push("native-auth:registration-login-logout-ui-missing");
}`
);
