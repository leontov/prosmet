import { AppShell } from "@/components/app-shell";
import { KolibriRuntimeProvider } from "@/components/kolibri-runtime-provider";

export default function HomePage() {
  return (
    <KolibriRuntimeProvider>
      <AppShell />
    </KolibriRuntimeProvider>
  );
}
