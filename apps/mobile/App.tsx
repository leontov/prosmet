import { useCallback, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Estimate } from "@prosmet/contracts";
import { RuntimeProvider } from "./src/runtime/RuntimeProvider";
import { ChatScreen } from "./src/screens/ChatScreen";
import { EstimateScreen } from "./src/screens/EstimateScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { BottomNav, type MobileTab } from "./src/BottomNav";
import { demoEstimate } from "./src/data";
import { theme } from "./src/theme";

export default function App() {
  const [tab, setTab] = useState<MobileTab>("chat");
  const [estimate, setEstimate] = useState<Estimate>(demoEstimate);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const onEstimateReady = useCallback((incoming: Estimate) => {
    setEstimate(incoming);
    setEstimateOpen(true);
  }, []);

  return (
    <SafeAreaProvider>
      <RuntimeProvider onEstimateReady={onEstimateReady}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.canvas }} edges={["top", "left", "right"]}>
          <StatusBar style="dark" />
          {estimateOpen ? (
            <EstimateScreen estimate={estimate} onChange={setEstimate} onClose={() => setEstimateOpen(false)} />
          ) : (
            <>
              {tab === "chat" ? <ChatScreen hasEstimate={Boolean(estimate)} onOpenEstimate={() => setEstimateOpen(true)} /> : null}
              {tab === "projects" ? <EstimateScreen estimate={estimate} onChange={setEstimate} onClose={() => setTab("chat")} libraryMode /> : null}
              {tab === "account" ? <AccountScreen /> : null}
              {tab === "settings" ? <SettingsScreen /> : null}
              <BottomNav tab={tab} onChange={setTab} />
            </>
          )}
        </SafeAreaView>
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}
