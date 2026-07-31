import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from "@assistant-ui/react-native";
import { theme } from "../theme";

type Props = { hasEstimate: boolean; onOpenEstimate: () => void };

const suggestions = [
  ["Ремонт квартиры", "Составь смету на ремонт квартиры"],
  ["Штукатурка 358 м²", "Рассчитай механизированную штукатурку 358 м² в Казани"],
  ["Комплект документов", "Подготовь смету, КП и договор"]
] as const;

export function ChatScreen({ hasEstimate, onOpenEstimate }: Props) {
  return (
    <View style={styles.screen}>
      <ThreadPrimitive.Root style={styles.thread}>
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <ScrollView
            style={styles.emptyScroll}
            contentContainerStyle={styles.welcome}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heroMark}><Text style={styles.heroMarkText}>✦</Text></View>
            <Text style={styles.title}>Новый расчёт</Text>
            <Text style={styles.subtitle}>Опишите объект или выберите задачу.</Text>
            <View style={styles.suggestions}>
              {suggestions.map(([title, prompt], index) => (
                <ThreadPrimitive.Suggestion key={title} prompt={prompt} send style={styles.suggestion}>
                  <View style={styles.suggestionIcon}>
                    <Text style={styles.suggestionIconText}>{index === 0 ? "⌂" : index === 1 ? "▤" : "□"}</Text>
                  </View>
                  <View style={styles.suggestionCopy}>
                    <Text style={styles.suggestionTitle}>{title}</Text>
                    <Text style={styles.suggestionText}>{prompt}</Text>
                  </View>
                  <Text style={styles.arrow}>↗</Text>
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
            <Text style={styles.attach}>＋</Text>
            <ComposerPrimitive.Input
              style={styles.input}
              placeholder="Сообщение Просметчику"
              placeholderTextColor={theme.faint}
              multiline
            />
            <ComposerPrimitive.Send style={styles.send}>
              <Text style={styles.sendText}>↑</Text>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </View>
      </ThreadPrimitive.Root>
    </View>
  );
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
  welcome: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 26, paddingBottom: 118 },
  heroMark: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 16 },
  heroMarkText: { color: theme.text, fontSize: 22 },
  title: { marginTop: 22, color: theme.text, fontSize: 32, lineHeight: 37, fontWeight: "700", letterSpacing: -1.3 },
  subtitle: { marginTop: 9, color: theme.muted, fontSize: 17, lineHeight: 25 },
  suggestions: { marginTop: 28, gap: 10 },
  suggestion: { minHeight: 98, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 19, backgroundColor: theme.canvas, padding: 13 },
  suggestionIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: theme.soft },
  suggestionIconText: { color: theme.muted, fontSize: 20 },
  suggestionCopy: { flex: 1 },
  suggestionTitle: { color: theme.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  suggestionText: { marginTop: 5, color: theme.muted, fontSize: 13, lineHeight: 18 },
  arrow: { color: theme.faint, fontSize: 19 },
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
  footer: { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.canvas },
  composer: { minHeight: 60, flexDirection: "row", alignItems: "flex-end", gap: 4, borderWidth: 1, borderColor: theme.borderStrong, borderRadius: 22, backgroundColor: theme.canvas, padding: 7 },
  attach: { width: 42, height: 42, color: theme.muted, textAlign: "center", textAlignVertical: "center", fontSize: 22 },
  input: { minHeight: 44, maxHeight: 140, flex: 1, color: theme.text, fontSize: 17, lineHeight: 23, paddingHorizontal: 5, paddingVertical: 10 },
  send: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: theme.text },
  sendText: { color: "white", fontSize: 21, fontWeight: "700" }
});
