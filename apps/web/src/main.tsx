import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { LandingPageProduction } from "./landing/LandingPageProduction";
import "./landing/landing-render.css";

const AppEntry = lazy(() => import("./app/AppEntry"));
const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const showLanding = normalizedPath === "/landing" || normalizedPath === "/";
const title = showLanding ? "KolibriAI — сметы с помощью ИИ" : "KolibriAI — рабочее пространство";
const description = showLanding
  ? "KolibriAI понимает строительную задачу обычным языком, считает объёмы, работает с ценами и создаёт сметы и документы."
  : "KolibriAI — рабочее пространство для строительных смет, проектов, документов и фактического выполнения.";
const canonical = `https://kolibriai.online${showLanding ? "/" : normalizedPath === "/app" ? "/app" : "/"}`;

document.title = title;
document.querySelector('meta[name="description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);

document.documentElement.dataset.accent = "orange";
document.documentElement.classList.add("dark-mode");

createRoot(root).render(
  <StrictMode>
    {showLanding ? <LandingPageProduction /> : <Suspense fallback={<div role="status" aria-label="Загрузка KolibriAI" style={{ minHeight: "100dvh", background: "#1A1817", color: "#FAFAFA" }} />}><AppEntry /></Suspense>}
  </StrictMode>
);
