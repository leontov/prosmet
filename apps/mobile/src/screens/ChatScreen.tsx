import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from "@assistant-ui/react-native";
import { GlobeGlyph, ImageGlyph, MicGlyph, PenGlyph, PlusGlyph, VoiceGlyph } from "../ReferenceIcons";
import { theme } from "../theme";

type Props = { hasEstimate: boolean; onOpenEstimate: () => void; focusRequest: number };

type QuickAction = {
  id: "image" | "write" | "search";
  title: string;
  prompt: string;
};

const quickActions: QuickAction[] = [
  {
    id: "image",
    title: "Создать изображение",
    prompt: "Создай наглядную визуализацию строительного решения для моего объекта"
  },
  {
    id: "write",
    title: "Напиши или отредактируй",
    prompt: "Помоги написать или отредактировать документ по моему проекту"
  },
  {
    id: "search",
    title: "Искать в интернете",
    prompt: "Найди в интернете актуальные цены и источники для моей сметы"
  }
];

export function ChatScreen({ hasEstimate, onOpenEstimate, focusRequest }: Props) {
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  return (
    <View style={styles.screen}>
      <ThreadPrimitive.Root style={styles.thread}>
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <ScrollView
            style={styles.emptyScroll}
            contentContainerStyle={styles.emptyContent}
            keyboardShouldPersistTaps="handled"
            testID="native-reference-start"
          >
            <View style={styles.emptySpace} />
            <View style={styles.quickActions} accessibilityLabel="Быстрые действия">
              {quickActions.map((item) => (
                <ThreadPrimitive.Suggestion key={item.id} prompt={item.prompt} send style={styles.quickAction}>
                  <View style={styles.quickIcon}><QuickActionGlyph id={item.id} /></View>
                  <Text style={styles.quickText}>{item.title}</Text>
                </ThreadPrimitive.Suggestion>
              ))}
            </View>
          </ScrollView>
        </AuiIf>

        <AuiIf condition={(state) => !state.thread.isEmpty}>
          <ThreadPrimitive.MessagesFlatList
            autoScroll
            style={styles.messageList}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={hasEstimate ? (
              <Pressable onPress={onOpenEstimate} accessibilityRole="button" style={styles.artifact}>
                <Text style={styles.artifactIcon}>▤</Text>
                <View style={styles.artifactCopy}>
                  <Text style={styles.artifactTitle}>Смета готова</Text>
                  <Text style={styles.artifactText}>Открыть и проверить расчёт</Text>
                </View>
                <Text style={styles.artifactAction}>Открыть</Text>
              </Pressable>
            ) : null}
          >
            {({ message }) => message.role === "user" ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.MessagesFlatList>
        </AuiIf>

        <View style={styles.footer}>
          <ComposerPrimitive.Root style={styles.composer}>
            <Pressable style={styles.composerUtility} accessibilityRole="button" accessibilityLabel="Добавить запрос" onPress={() => inputRef.current?.focus()}>
              <PlusGlyph />
            </Pressable>
            <ComposerPrimitive.Input
              ref={inputRef}
              style={styles.input}
              placeholder="Спросить Просметчик..."
              placeholderTextColor="#9a9b9e"
              multiline
            />
            <Pressable style={styles.composerMic} accessibilityRole="button" accessibilityLabel="Голосовой ввод" onPress={() => inputRef.current?.focus()}>
              <MicGlyph />
            </Pressable>
            <ComposerPrimitive.Send style={styles.send} accessibilityLabel="Отправить">
              <View style={styles.sendGlyph}><VoiceGlyph color="#ffffff" /></View>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </View>
      </ThreadPrimitive.Root>
    </View>
  );
}

function QuickActionGlyph({ id }: { id: QuickAction["id"] }) {
  if (id === "image") return <ImageGlyph />;
  if (id === "write") return <PenGlyph />;
  return <GlobeGlyph />;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root style={styles.userMessage}>
      <View style={styles.userBubble}><MessagePrimitive.Parts /></View>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root style={styles.assistantMessage}>
      <View style={styles.assistantAvatar}><Text style={styles.assistantAvatarText}>✦</Text></View>
      <View style={styles.assistantCopy}><MessagePrimitive.Parts /></View>
    </MessagePrimitive.Root>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.canvas },
  thread: { flex: 1 },
  emptyScroll: { flex: 1 },
  emptyContent: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 28, paddingBottom: 14 },
  emptySpace: { minHeight: 250, flex: 1 },
  quickActions: { gap: 14 },
  quickAction: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 3
  },
  quickIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  quickText: { flex: 1, color: "#66676a", fontSize: 18, lineHeight: 23, fontWeight: "600", letterSpacing: -0.35 },
  messageList: { flex: 1 },
  messages: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 24, gap: 22 },
  userMessage: { alignItems: "flex-end" },
  userBubble: { maxWidth: "86%", borderRadius: 20, borderBottomRightRadius: 7, backgroundColor: "#f0f0f1", paddingHorizontal: 15, paddingVertical: 12 },
  assistantMessage: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  assistantAvatar: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 10 },
  assistantAvatarText: { color: theme.text, fontSize: 14 },
  assistantCopy: { flex: 1, paddingTop: 3 },
  artifact: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2, borderWidth: 1, borderColor: theme.border, borderRadius: 18, backgroundColor: theme.canvas, padding: 14 },
  artifactIcon: { width: 48, height: 48, overflow: "hidden", borderRadius: 14, backgroundColor: theme.soft, color: theme.text, textAlign: "center", textAlignVertical: "center", fontSize: 20 },
  artifactCopy: { flex: 1 },
  artifactTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  artifactText: { marginTop: 5, color: theme.muted, fontSize: 13 },
  artifactAction: { color: theme.text, fontSize: 12, fontWeight: "700" },
  footer: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, backgroundColor: theme.canvas },
  composer: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    borderWidth: 1.4,
    borderColor: "rgba(17,18,20,0.82)",
    borderRadius: 34,
    backgroundColor: theme.canvas,
    paddingHorizontal: 6,
    paddingVertical: 5,
    shadowColor: "#111214",
    shadowOpacity: 0.11,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6
  },
  composerUtility: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  input: { minHeight: 46, maxHeight: 126, flex: 1, color: "#111214", fontSize: 17, lineHeight: 23, paddingHorizontal: 4, paddingVertical: 10 },
  composerMic: { width: 42, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  send: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#0a84ff" },
  sendGlyph: { transform: [{ scale: 0.73 }] }
});
