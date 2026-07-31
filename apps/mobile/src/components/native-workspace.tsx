import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { NativeThread } from "@/src/components/native-thread";
import { getApiBase } from "@/src/config";

type Manifest = { productName?: string; organizationName?: string; modules?: string[] };
type ManifestResponse = { manifest?: Manifest };

export function NativeWorkspace() {
  const [manifest, setManifest] = useState<Manifest>({ productName: "Просметчик" });
  useEffect(() => {
    void getApiBase()
      .then((base: string) => fetch(`${base}/api/client-manifest`, { credentials: "include" }))
      .then((response: Response) => response.ok ? response.json() as Promise<ManifestResponse> : null)
      .then((payload: ManifestResponse | null) => {
        if (payload?.manifest) setManifest(payload.manifest);
      })
      .catch(() => undefined);
  }, []);
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>П</Text></View>
          <View><Text style={styles.title}>{manifest.productName || "Просметчик"}</Text><Text style={styles.subtitle}>{manifest.organizationName || "Универсальный ассистент"}</Text></View>
        </View>
        <Link href="/settings" asChild><Pressable style={styles.settings} accessibilityLabel="Настройки"><Text style={styles.settingsText}>•••</Text></Pressable></Link>
      </View>
      <NativeThread />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f7f5" },
  header: { height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#232321", alignItems: "center", justifyContent: "center" },
  markText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  title: { color: "#171716", fontSize: 15, fontWeight: "600" },
  subtitle: { color: "#85857e", fontSize: 10, marginTop: 1 },
  settings: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  settingsText: { color: "#63635e", fontSize: 17, letterSpacing: 1 }
});
