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

export function ReferenceApp() {
  const mobile = useMediaQuery("(max-width: 767px)");
  return mobile ? <MobileWebApp /> : <DesktopApplication />;
}
