"use client";

import { useEffect, useState } from "react";
import { ClientManifestSchema, DEFAULT_CLIENT_MANIFEST } from "@/lib/domain/client-manifest";

export function useClientManifest() {
  const [manifest, setManifest] = useState(DEFAULT_CLIENT_MANIFEST);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/client-manifest", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.manifest) setManifest(ClientManifestSchema.parse(payload.manifest));
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);
  return { manifest, ready, hasModule: (module: string) => manifest.modules.includes(module as never) };
}
