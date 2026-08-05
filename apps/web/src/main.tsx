import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./landing/LandingPage";
import "./landing/landing-render.css";

const AppEntry = lazy(() => import("./app/AppEntry"));

const root = document.getElementById("root");
if (!root) throw new Error("Root element is missing");

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const showLanding = normalizedPath === "/landing";
const title = showLanding
  ? "ProSmet — AI-сметы и управление строительным проектом"
  : "ProSmet — рабочее пространство";
const description = showLanding
  ? "ProSmet создаёт строительные сметы, открывает их в интерактивном редакторе и ведёт проект до актов, КС-2 и КС-3."
  : "ProSmet — рабочее пространство для строительных смет, проектов, документов и фактического выполнения.";
const canonical = `https://kolibriai.online${showLanding ? "/landing" : normalizedPath === "/app" ? "/app" : "/"}`;

document.title = title;
document.querySelector('meta[name="description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);

createRoot(root).render(
  <StrictMode>
    {showLanding ? (
      <LandingPage />
    ) : (
      <Suspense fallback={<div role="status" aria-label="Загрузка ProSmet" style={{ minHeight: "100dvh", background: "#fff" }} />}>
        <AppEntry />
      </Suspense>
    )}
  </StrictMode>
);
