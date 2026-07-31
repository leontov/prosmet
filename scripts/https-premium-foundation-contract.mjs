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
  "app/premium-product.css",
  "app/premium-product-fixes.css",
  "components/chat/premium-prosmet-thread.tsx",
  "docs/PREMIUM_UI_V2_BRIEF.md"
]) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const layout = await read("app/layout.tsx");
need(layout, 'import "./premium-product.css"', "layout");
need(layout, 'import "./premium-product-fixes.css"', "layout");
forbid(layout, 'import "./premium-foundation.css"', "layout");
forbid(layout, 'import "./estimate-workspace.css"', "layout");
need(layout, "https://kolibriai.online", "layout");
need(layout, "NEXT_PUBLIC_APP_ORIGIN", "layout");

const nextConfig = await read("next.config.ts");
need(nextConfig, "microphone=()", "browser-policy");
forbid(nextConfig, "Cross-Origin-Opener-Policy", "browser-policy");
forbid(nextConfig, "'wasm-unsafe-eval'", "browser-policy");
forbid(nextConfig, "'unsafe-eval'\",\n  \"style-src", "browser-policy");

const premiumCss = `${await read("app/premium-product.css")}\n${await read("app/premium-product-fixes.css")}`;
for (const token of [
  ":focus-visible",
  "prefers-reduced-motion",
  "--prosmet-touch-target: 48px",
  ".prosmet-v2-mobile-nav",
  ".prosmet-v2-mobile-row",
  "env(safe-area-inset-bottom)",
  ".prosmet-v2-row-sheet-footer"
]) {
  need(premiumCss, token, "premium-v2-css");
}
for (const token of [
  "PROSMET UX PREMIUM FOUNDATION V1",
  'body[data-prosmet-estimate-open="true"] main',
  ".prosmet-premium-app-shell",
  ".prosmet-premium-estimate-paper"
]) {
  forbid(premiumCss, token, "legacy-v1-css");
}

const thread = await read("components/chat/premium-prosmet-thread.tsx");
for (const token of [
  "ActionBarPrimitive.Speak",
  "FeedbackPositive",
  "FeedbackNegative",
  "Прочитать вслух",
  "Хороший ответ",
  "Плохой ответ"
]) {
  forbid(thread, token, "unsupported-capability-gating");
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
      contract: "prosmet-ux-premium-v2",
      origin: "https://kolibriai.online",
      https: "automatic certificate + redirect + HSTS",
      capabilities: "unsupported speech and feedback omitted",
      accessibility: "focus-visible + 48px touch policy + reduced motion",
      adaptive: "native mobile navigation and large estimate cards"
    },
    null,
    2
  )
);
