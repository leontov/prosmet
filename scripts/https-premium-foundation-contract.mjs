import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFile(resolve(root, path), "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};
const needMatch = (source, pattern, scope, label) => {
  if (!pattern.test(source)) failures.push(`${scope}:missing:${label}`);
};

for (const path of [
  "deployment/provision-https.sh",
  "app/premium-foundation.css",
  "docs/UX_PREMIUM_FOUNDATION_V1.md"
]) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const layout = await read("app/layout.tsx");
need(layout, 'import "./premium-foundation.css"', "layout");
need(layout, "https://kolibriai.online", "layout");
need(layout, "NEXT_PUBLIC_APP_ORIGIN", "layout");

const nextConfig = await read("next.config.ts");
need(nextConfig, "microphone=()", "browser-policy");
forbid(nextConfig, "Cross-Origin-Opener-Policy", "browser-policy");
forbid(nextConfig, "'wasm-unsafe-eval'", "browser-policy");
forbid(nextConfig, "'unsafe-eval'\",\n  \"style-src", "browser-policy");

const premiumCss = await read("app/premium-foundation.css");
for (const token of [
  'button[aria-label="Прочитать вслух"]',
  'button[aria-label="Хороший ответ"]',
  'button[aria-label="Плохой ответ"]',
  ':focus-visible',
  'aria-label="Режим разработчика"',
  "prefers-reduced-motion",
  "--prosmet-touch-target: 44px",
  'body[data-prosmet-estimate-open="true"] main'
]) {
  need(premiumCss, token, "premium-css");
}

const identity = await read("lib/server/identity.ts");
needMatch(
  identity,
  /request\.headers\s*\n?\s*\.get\("x-forwarded-proto"\)/,
  "secure-cookie",
  'request.headers.get("x-forwarded-proto")'
);
need(identity, '"; Secure"', "secure-cookie");
need(identity, "Priority=High", "secure-cookie");

const https = await read("deployment/provision-https.sh");
for (const token of [
  "kolibriai.online",
  "caddyserver/caddy/releases/download",
  "cap_net_bind_service",
  "Strict-Transport-Security",
  "X-Forwarded-Proto https",
  "waiting-for-dns",
  "https://${DOMAIN}/api/health"
]) {
  need(https, token, "https-edge");
}

const deploy = await read("deployment/direct-primary.sh");
for (const token of [
  "PROSMET_PUBLIC_DOMAIN",
  "PROSMET_PUBLIC_ORIGIN",
  "NEXT_PUBLIC_APP_ORIGIN",
  '"url": "${PUBLIC_ORIGIN}/"'
]) {
  need(deploy, token, "application-deploy");
}

const workflow = await read(".github/workflows/launch-3200.yml");
for (const token of [
  "PROSMET_PUBLIC_DOMAIN: kolibriai.online",
  "Provision HTTPS for kolibriai.online",
  "Verify the exact public HTTPS release",
  "https://kolibriai.online",
  "strict-transport-security"
]) {
  need(workflow, token, "production-workflow");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "prosmet-ux-premium-foundation-v1",
      origin: "https://kolibriai.online",
      https: "automatic certificate + redirect + HSTS",
      capabilities: "unsupported speech and feedback hidden",
      accessibility: "focus-visible + 44px touch policy + reduced motion",
      adaptive: "single supporting surface on medium windows"
    },
    null,
    2
  )
);
