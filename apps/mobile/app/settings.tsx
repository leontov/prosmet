import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiBase, setApiBase } from "@/src/config";

export default function SettingsScreen() {
  const [url, setUrl] = useState("");
  const [identity, setIdentity] = useState<{ ownerId?: string; roles?: string[] } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getApiBase().then(async (base) => {
      setUrl(base);
      const response = await fetch(`${base}/api/identity`, { credentials: "include" }).catch(() => null);
      if (response?.ok) setIdentity(await response.json());
    });
  }, []);

  const save = async () => {
    await setApiBase(url);
    setMessage("Сервер сохранён в защищённом хранилище устройства.");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Link href="/" asChild><Pressable><Text style={styles.back}>‹ Чат</Text></Pressable></Link>
        <Text style={styles.title}>Настройки</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Сервер рабочего пространства</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          placeholder="https://kolibriai.online"
        />
        <Pressable style={styles.button} onPress={save}><Text style={styles.buttonText}>Сохранить</Text></Pressable>
        {message ? <Text style={styles.muted}>{message}</Text> : null}
        <View style={styles.divider} />
        <Text style={styles.label}>Идентификатор владельца</Text>
        <Text selectable style={styles.code}>{identity?.ownerId || "Будет создан после подключения"}</Text>
        <Text style={styles.muted}>Роли: {identity?.roles?.join(", ") || "обычный пользователь"}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f7f5" },
  header: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#deded9" },
  back: { fontSize: 16, color: "#575752" },
  title: { fontSize: 17, fontWeight: "600", color: "#171716" },
  content: { padding: 20, gap: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#343431" },
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", borderRadius: 13, backgroundColor: "#fff", paddingHorizontal: 14, fontSize: 15, color: "#171716" },
  button: { height: 46, borderRadius: 13, backgroundColor: "#20201e", alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  muted: { color: "#73736d", fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#deded9", marginVertical: 10 },
  code: { borderRadius: 12, backgroundColor: "#ededeb", padding: 12, fontFamily: "monospace", color: "#343431" }
});
