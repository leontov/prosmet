import type { Metadata, Viewport } from "next";
import { LocalWorkspaceProvider } from "@/lib/local/context";
import { MyRuntimeProvider } from "@/app/MyRuntimeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Просметчик — AI-сметная контора",
    template: "%s · Просметчик"
  },
  description:
    "Профессиональные строительные сметы, технологические карты и документы в одном AI-чате.",
  applicationName: "Просметчик"
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
      <body className="h-dvh overflow-hidden">
        <LocalWorkspaceProvider>
          <MyRuntimeProvider>{children}</MyRuntimeProvider>
        </LocalWorkspaceProvider>
      </body>
    </html>
  );
}
