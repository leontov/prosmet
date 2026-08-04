import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleButton, ScreenHeader, SegmentTabs, mobileChromeStyles } from "../MobileChrome";
import { BackGlyph, CheckGlyph, DocumentGlyph, MicGlyph, MoreGlyph, PlusGlyph, VoiceGlyph } from "../ReferenceIcons";
import type { ProjectSummary } from "../mobile-data";
import { formatRelativeDate, statusLabel } from "../mobile-data";
import { theme } from "../theme";

type ProjectTab = "chat" | "work";

type Props = {
  project: ProjectSummary;
  onBack: () => void;
  onOpenEstimate: (id: string) => void;
  onAsk: (message: string) => void;
  onOpenSettings: () => void;
};

const tabs: Array<{ id: ProjectTab; label: string }> = [
  { id: "chat", label: "Чат" },
  { id: "work", label: "Работа" }
];

export function ProjectScreen({ project, onBack, onOpenEstimate, onAsk, onOpenSettings }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ProjectTab>("chat");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [message, setMessage] = useState("");
  const items = useMemo(() => project.estimates.map((estimate) => ({
    id: estimate.id,
    title: estimate.title,
    subtitle: `${statusLabel(estimate.status)} · ${formatRelativeDate(estimate.updatedAt)}`,
    region: estimate.region
  })), [project.estimates]);

  const submit = () => {
    const value = message.trim();
    if (!value) return;
    setMessage("");
    onAsk(value);
  };

  return (
    <KeyboardAvoidingView style={mobileChromeStyles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScreenHeader
        title={project.title}
        onTitlePress={() => setSelectorOpen((value) => !value)}
        left={<CircleButton accessibilityLabel="Назад к проектам" onPress={onBack}><BackGlyph /></CircleButton>}
        right={<CircleButton accessibilityLabel="Действия проекта" onPress={() => setMoreOpen((value) => !value)}><MoreGlyph /></CircleButton>}
      />
      <SegmentTabs items={tabs} value={tab} onChange={setTab} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingBottom: 110 + Math.max(insets.bottom, 12) }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => tab === "chat" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpenEstimate(item.id)} style={({ pressed }) => [styles.chatRow, pressed && styles.pressed]}>
            <Text style={styles.chatTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.chatSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onOpenEstimate(item.id)} style={({ pressed }) => [styles.workCard, pressed && styles.pressed]}>
            <View style={styles.workIcon}><DocumentGlyph color="#111214" /></View>
            <View style={styles.workCopy}>
              <Text style={styles.workTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.workSubtitle} numberOfLines={2}>{item.region || item.subtitle}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{tab === "chat" ? "В проекте пока нет диалогов" : "В проекте пока нет смет"}</Text><Text style={styles.emptyText}>Отправьте сообщение, чтобы начать работу внутри проекта.</Text></View>}
      />

      {selectorOpen ? <View style={styles.selector}>{tabs.map((item) => <Pressable key={item.id} onPress={() => { setTab(item.id); setSelectorOpen(false); }} style={styles.selectorRow}><View style={styles.selectorCheck}>{tab === item.id ? <CheckGlyph /> : null}</View><Text style={styles.selectorText}>{item.label}</Text></Pressable>)}</View> : null}

      {moreOpen ? <View style={styles.moreMenu}>{project.estimates[0] ? <Pressable onPress={() => { onOpenEstimate(project.estimates[0]!.id); setMoreOpen(false); }} style={styles.moreRow}><Text style={styles.moreText}>Открыть последнюю смету</Text></Pressable> : null}<Pressable onPress={() => { onOpenSettings(); setMoreOpen(false); }} style={styles.moreRow}><Text style={styles.moreText}>Настройки проекта</Text></Pressable></View> : null}

      <View style={[styles.composerLayer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Добавить файл" onPress={() => setMessage((value) => value)} style={styles.utility}><PlusGlyph /></Pressable>
          <TextInput value={message} onChangeText={setMessage} onSubmitEditing={submit} blurOnSubmit={false} multiline placeholder={`Сообщение ${project.title}`} placeholderTextColor="#9b9c9f" style={styles.input} accessibilityLabel="Сообщение проекту" />
          <Pressable accessibilityRole="button" accessibilityLabel="Голосовой ввод" onPress={() => setMessage((value) => value)} style={styles.mic}><MicGlyph /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" onPress={submit} style={styles.send}><View style={styles.sendScale}><VoiceGlyph color="#fff" /></View></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  list: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 10 },
  chatRow: { minHeight: 76, justifyContent: "center", borderRadius: 18, paddingHorizontal: 2, paddingVertical: 8 },
  chatTitle: { color: "#111214", fontSize: 22, lineHeight: 27, fontWeight: "700", letterSpacing: -0.55 },
  chatSubtitle: { marginTop: 4, color: "#929397", fontSize: 18, lineHeight: 23, fontWeight: "600", letterSpacing: -0.35 },
  workCard: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(17,18,20,0.08)", borderRadius: 22, backgroundColor: theme.canvas, padding: 14 },
  workIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#f2f2f3" },
  workCopy: { minWidth: 0, flex: 1 },
  workTitle: { color: "#111214", fontSize: 19, lineHeight: 24, fontWeight: "700" },
  workSubtitle: { marginTop: 5, color: "#929397", fontSize: 14, lineHeight: 19 },
  empty: { flex: 1, minHeight: 420, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  emptyTitle: { color: "#111214", fontSize: 22, lineHeight: 28, fontWeight: "800", textAlign: "center" },
  emptyText: { marginTop: 8, color: "#929397", fontSize: 15, lineHeight: 22, textAlign: "center" },
  selector: { position: "absolute", top: 62, left: "18%", right: "18%", zIndex: 30, borderWidth: 1.2, borderColor: "rgba(17,18,20,0.72)", borderRadius: 28, backgroundColor: "#f5f5f6", paddingVertical: 12, shadowColor: "#111214", shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  selectorRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 19 },
  selectorCheck: { width: 30, alignItems: "center", justifyContent: "center", transform: [{ scale: 0.8 }] },
  selectorText: { color: "#111214", fontSize: 22, lineHeight: 27, fontWeight: "700" },
  moreMenu: { position: "absolute", top: 66, right: 16, zIndex: 31, width: 244, borderWidth: 1, borderColor: "rgba(17,18,20,0.12)", borderRadius: 20, backgroundColor: theme.canvas, padding: 8, shadowColor: "#111214", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  moreRow: { minHeight: 50, justifyContent: "center", borderRadius: 14, paddingHorizontal: 12 },
  moreText: { color: "#111214", fontSize: 16, lineHeight: 21, fontWeight: "600" },
  composerLayer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 34, paddingTop: 10, backgroundColor: "rgba(255,255,255,0.96)" },
  composer: { minHeight: 58, flexDirection: "row", alignItems: "center", borderWidth: 1.3, borderColor: "rgba(17,18,20,0.82)", borderRadius: 30, backgroundColor: theme.canvas, paddingHorizontal: 5, paddingVertical: 4, shadowColor: "#111214", shadowOpacity: 0.09, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
  utility: { width: 45, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  input: { minHeight: 48, maxHeight: 112, flex: 1, color: "#111214", fontSize: 17, lineHeight: 23, fontWeight: "600", paddingHorizontal: 2, paddingVertical: 10 },
  mic: { width: 42, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  send: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#0a84ff" },
  sendScale: { transform: [{ scale: 0.74 }] }
});
