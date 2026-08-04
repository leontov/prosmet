import { useEffect, useState } from "react";
import { App as DesktopApplication } from "./App";
import { MobileWebApp } from "./MobileWebApp";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function useMobileChromeAccessibility(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const demoteDecorativeTitles = () => {
      document.querySelectorAll<HTMLElement>(".prosmet-screen-header h1").forEach((title) => {
        title.setAttribute("role", "presentation");
        title.setAttribute("aria-hidden", "true");
      });
    };

    demoteDecorativeTitles();
    const observer = new MutationObserver(demoteDecorativeTitles);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);
}

export function ReferenceApp() {
  const mobile = useMediaQuery("(max-width: 767px)");
  useMobileChromeAccessibility(mobile);
  return mobile ? <MobileWebApp /> : <DesktopApplication />;
}
