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
contract.write_text(source, encoding="utf-8")
