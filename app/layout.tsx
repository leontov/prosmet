import type { Metadata, Viewport } from "next";
import { MyRuntimeProvider } from "@/app/MyRuntimeProvider";
import { RuntimeStatusProvider } from "@/components/app/runtime-status";
import { LocalWorkspaceProvider } from "@/lib/local/context";
import "./globals.css";

const browserCompatibilityScript = String.raw`
(() => {
  const target = globalThis.crypto;
  if (!target || typeof target.randomUUID === "function") return;

  const bytesToUuid = (bytes) => {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join("")
    ].join("-");
  };

  let counter = 0;
  const compatibleRandomUuid = () => {
    if (typeof target.getRandomValues === "function") {
      return bytesToUuid(target.getRandomValues(new Uint8Array(16)));
    }

    counter += 1;
    const seed = [
      Date.now().toString(16),
      counter.toString(16),
      Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)
    ].join("").padEnd(32, "0").slice(0, 32);
    const bytes = new Uint8Array(16);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16) || 0;
    }
    return bytesToUuid(bytes);
  };

  try {
    Object.defineProperty(target, "randomUUID", {
      configurable: true,
      enumerable: false,
      value: compatibleRandomUuid
    });
  } catch {
    target.randomUUID = compatibleRandomUuid;
  }
})();
`;

export const metadata: Metadata = {
  title: {
    default: "Просметчик — AI-сметная контора",
    template: "%s · Просметчик"
  },
  description:
    "Профессиональные строительные сметы, технологические карты и документы в одном AI-чате.",
  applicationName: "Просметчик",
  icons: {
    icon: "/favicon.ico"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-dvh">
      <head>
        <script
          id="prosmet-browser-compat"
          dangerouslySetInnerHTML={{ __html: browserCompatibilityScript }}
        />
      </head>
      <body className="h-dvh overflow-hidden">
        <LocalWorkspaceProvider>
          <RuntimeStatusProvider>
            <MyRuntimeProvider>{children}</MyRuntimeProvider>
          </RuntimeStatusProvider>
        </LocalWorkspaceProvider>
      </body>
    </html>
  );
}
