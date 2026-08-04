import { useEffect } from "react";
import { ProfessionalApp } from "./ProfessionalApp";

function normalizeChromeHeadings() {
  for (const heading of document.querySelectorAll<HTMLElement>(
    ".pro-desktop-topbar h1, .pro-mobile-topbar h1"
  )) {
    heading.setAttribute("aria-hidden", "true");
  }
}

export function ReferenceApp() {
  useEffect(() => {
    normalizeChromeHeadings();
    const observer = new MutationObserver(normalizeChromeHeadings);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <ProfessionalApp />;
}
