from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement target, found {count}")
    path.write_text(source.replace(old, new), encoding="utf-8")


main = Path("apps/web/src/main.tsx")
replace_once(
    main,
    '''import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

const AppEntry = lazy(() => import("./app/AppEntry"));
const LandingPage = lazy(() =>
  import("./landing/LandingPage").then((module) => ({ default: module.LandingPage }))
);''',
    '''import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./landing/LandingPage";

const AppEntry = lazy(() => import("./app/AppEntry"));''',
)
replace_once(
    main,
    '''  <StrictMode>
    <Suspense fallback={<div role="status" aria-label="Загрузка ProSmet" style={{ minHeight: "100dvh", background: "#fff" }} />}>
      {showLanding ? <LandingPage /> : <AppEntry />}
    </Suspense>
  </StrictMode>''',
    '''  <StrictMode>
    {showLanding ? (
      <LandingPage />
    ) : (
      <Suspense fallback={<div role="status" aria-label="Загрузка ProSmet" style={{ minHeight: "100dvh", background: "#fff" }} />}>
        <AppEntry />
      </Suspense>
    )}
  </StrictMode>''',
)

css = Path("apps/web/src/landing/landing.css")
source = css.read_text(encoding="utf-8")
performance_css = '''

.growth-section,
.growth-final-cta,
.growth-footer {
  content-visibility: auto;
  contain-intrinsic-size: auto 900px;
}

.growth-workflow-list article > b { color: #5f6369; }
.growth-enterprise .growth-eyebrow { color: #8bbcff; }
.growth-lead-form > small { color: #a8adb4; }
.growth-footer > small { color: #64686e; }
'''
if "content-visibility: auto" not in source:
    css.write_text(source.rstrip() + performance_css + "\n", encoding="utf-8")

public = Path("apps/web/public")
public.mkdir(parents=True, exist_ok=True)
(public / "robots.txt").write_text(
    "User-agent: *\nAllow: /\nSitemap: https://kolibriai.online/sitemap.xml\n",
    encoding="utf-8",
)
(public / "sitemap.xml").write_text(
    '''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://kolibriai.online/landing</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://kolibriai.online/app</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
''',
    encoding="utf-8",
)

server = Path("apps/web/server.mjs")
replace_once(
    server,
    'import { DatabaseSync } from "node:sqlite";',
    '''import { DatabaseSync } from "node:sqlite";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";''',
)
replace_once(
    server,
    '''  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"''',
    '''  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"''',
)

compression_helpers = r'''
const compressibleStaticExtensions = new Set([".html", ".js", ".css", ".json", ".svg", ".xml", ".txt", ".map"]);
const staticCompressionCache = new Map();

function compressedStaticPayload(filePath, extension, content, request) {
  if (!compressibleStaticExtensions.has(extension) || content.byteLength < 1024) {
    return { body: content, encoding: null };
  }
  const accepted = String(request.headers["accept-encoding"] || "").toLowerCase();
  const encoding = accepted.includes("br") ? "br" : accepted.includes("gzip") ? "gzip" : null;
  if (!encoding) return { body: content, encoding: null };
  const cacheKey = `${filePath}:${encoding}`;
  let body = staticCompressionCache.get(cacheKey);
  if (!body) {
    body = encoding === "br"
      ? brotliCompressSync(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
      : gzipSync(content, { level: 6 });
    staticCompressionCache.set(cacheKey, body);
  }
  return { body, encoding };
}

'''
replace_once(
    server,
    "\nconst server = createServer(async (request, response) => {",
    "\n" + compression_helpers + "const server = createServer(async (request, response) => {",
)
replace_once(
    server,
    '''      const content = await readFile(filePath);
      const extension = extname(filePath);
      response.writeHead(200, {
        "content-type": mime[extension] || "application/octet-stream",
        "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      });
      if (request.method === "HEAD") return response.end();
      response.end(content);''',
    '''      const content = await readFile(filePath);
      const extension = extname(filePath);
      const payload = compressedStaticPayload(filePath, extension, content, request);
      const headers = {
        "content-type": mime[extension] || "application/octet-stream",
        "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      };
      if (payload.encoding) {
        headers["content-encoding"] = payload.encoding;
        headers.vary = "accept-encoding";
      }
      response.writeHead(200, headers);
      if (request.method === "HEAD") return response.end();
      response.end(payload.body);''',
)

lighthouse = Path("scripts/run-landing-lighthouse.mjs")
replace_once(
    lighthouse,
    '''  const metrics = {
    largestContentfulPaint: result.lhr.audits["largest-contentful-paint"]?.numericValue ?? Infinity,
    totalBlockingTime: result.lhr.audits["total-blocking-time"]?.numericValue ?? Infinity,
    cumulativeLayoutShift: result.lhr.audits["cumulative-layout-shift"]?.numericValue ?? Infinity
  };''',
    '''  const metrics = {
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
    .sort((left, right) => (left.score ?? 1) - (right.score ?? 1));''',
)
replace_once(
    lighthouse,
    '''  const bundles = {
    landing: await largestMatching(/^LandingPage-.*\.js$/),
    application: await largestMatching(/^AppEntry-.*\.js$/),
    shared: await largestMatching(/^index-.*\.js$/)
  };''',
    '''  const bundles = {
    landing: await largestMatching(/^index-.*\.js$/),
    application: await largestMatching(/^AppEntry-.*\.js$/)
  };''',
)
replace_once(
    lighthouse,
    '''  const summary = { scores, metrics, bundles };''',
    '''  const summary = { scores, metrics, bundles, auditDiagnostics };''',
)
replace_once(
    lighthouse,
    '''  if (metrics.largestContentfulPaint > 3000) failures.push(`LCP=${metrics.largestContentfulPaint}`);''',
    '''  if (metrics.firstContentfulPaint > 2200) failures.push(`FCP=${metrics.firstContentfulPaint}`);
  if (metrics.speedIndex > 3500) failures.push(`SI=${metrics.speedIndex}`);
  if (metrics.largestContentfulPaint > 3000) failures.push(`LCP=${metrics.largestContentfulPaint}`);''',
)
replace_once(
    lighthouse,
    '''  if (bundles.landing.size > 60_000) failures.push(`landingBundle=${bundles.landing.size}`);
  if (bundles.application.size > 540_000) failures.push(`applicationBundle=${bundles.application.size}`);
  if (bundles.shared.size > 240_000) failures.push(`sharedBundle=${bundles.shared.size}`);''',
    '''  if (bundles.landing.size > 240_000) failures.push(`landingBundle=${bundles.landing.size}`);
  if (bundles.application.size > 540_000) failures.push(`applicationBundle=${bundles.application.size}`);''',
)
replace_once(
    lighthouse,
    '''} finally {
  await chrome?.kill().catch(() => undefined);
  server.kill("SIGTERM");''',
    '''} finally {
  if (chrome) {
    try { await chrome.kill(); } catch {}
  }
  server.kill("SIGTERM");''',
)

contract = Path("scripts/greenfield-contract.mjs")
source = contract.read_text(encoding="utf-8")
source = source.replace(
    '  "scripts/run-landing-lighthouse.mjs",',
    '  "scripts/run-landing-lighthouse.mjs",\n  "apps/web/public/robots.txt",\n  "apps/web/public/sitemap.xml",',
    1,
)
compression_guard = '''
if (!server.includes("content-encoding") || !server.includes("brotliCompressSync")) failures.push("server:static-compression-missing");
'''
marker = "if (failures.length) {"
if compression_guard not in source:
    if source.count(marker) != 1:
        raise SystemExit("Contract marker missing")
    source = source.replace(marker, compression_guard + marker)
contract.write_text(source, encoding="utf-8")
