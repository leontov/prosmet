import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from "@assistant-ui/react-native";
import { StyleSheet, Text, View } from "react-native";
import { NativeEstimateCard } from "@/src/components/estimate-card";

function UserMessage() {
  return (
    <MessagePrimitive.Root style={styles.userRoot}>
      <View style={styles.userBubble}>
        <MessagePrimitive.Content renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>} />
      </View>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root style={styles.assistantRoot}>
      <View style={styles.avatar}><Text style={styles.avatarText}>П</Text></View>
      <View style={styles.assistantContent}>
        <MessagePrimitive.Content
          renderText={({ part }) => <Text style={styles.assistantText}>{part.text}</Text>}
          renderToolCall={({ part }) => {
            const value = part as unknown as { toolName?: string; args?: unknown };
            return value.toolName === "estimate_draft"
              ? <NativeEstimateCard args={value.args} />
              : <View style={styles.tool}><Text style={styles.toolText}>{value.toolName || "Инструмент"}</Text></View>;
          }}
        />
      </View>
    </MessagePrimitive.Root>
  );
}

export function NativeThread() {
  return (
    <ThreadPrimitive.Root style={styles.root}>
      <AuiIf condition={(state) => state.thread.isEmpty}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Что нужно сделать?</Text>
          <Text style={styles.emptyText}>Опишите объект, работу или документ. Ассистент соберёт технологию, расчёт и результат.</Text>
          {[
            "Смета механизированной штукатурки 358 м², Татарстан",
            "Рассчитать ремонт квартиры и подготовить КП",
            "Создать договор и акт из утверждённой сметы"
          ].map((prompt) => (
            <ThreadPrimitive.Suggestion key={prompt} prompt={prompt} send style={styles.suggestion}>
              <Text style={styles.suggestionText}>{prompt}</Text>
            </ThreadPrimitive.Suggestion>
          ))}
        </View>
      </AuiIf>
      <ThreadPrimitive.MessagesFlatList
        autoScroll
        contentContainerStyle={styles.messages}
        components={{ UserMessage, AssistantMessage }}
      />
      <View style={styles.composerWrap}>
        <ComposerPrimitive.Root style={styles.composer}>
          <ComposerPrimitive.Input multiline placeholder="Сообщение Просметчику" placeholderTextColor="#92928b" style={styles.input} />
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send style={styles.send}><Text style={styles.sendText}>↑</Text></ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel style={styles.send}><View style={styles.stop} /></ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
        <Text style={styles.disclaimer}>ИИ может ошибаться. Расчёт утверждается серверным Rust-движком.</Text>
      </View>
    </ThreadPrimitive.Root>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  messages: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 150 },
  empty: { flex: 1, justifyContent: "center", paddingVertical: 70, gap: 12 },
  emptyTitle: { fontSize: 27, fontWeight: "600", letterSpacing: -0.6, color: "#171716", textAlign: "center", marginBottom: 2 },
  emptyText: { fontSize: 15, lineHeight: 22, color: "#6d6d67", textAlign: "center", marginBottom: 12 },
  suggestion: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#d7d7d2", backgroundColor: "#fbfbfa", borderRadius: 15, paddingHorizontal: 15, paddingVertical: 13 },
  suggestionText: { color: "#30302d", fontSize: 14, lineHeight: 20 },
  userRoot: { alignItems: "flex-end", marginVertical: 8 },
  userBubble: { maxWidth: "86%", backgroundColor: "#ededeb", borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 15, paddingVertical: 11 },
  userText: { fontSize: 15, lineHeight: 21, color: "#20201e" },
  assistantRoot: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginVertical: 10 },
  avatar: { width: 28, height: 28, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: "#d1d1cc", alignItems: "center", justifyContent: "center", backgroundColor: "#fafaf9" },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#555550" },
  assistantContent: { flex: 1, paddingTop: 2 },
  assistantText: { fontSize: 15, lineHeight: 23, color: "#242422" },
  tool: { borderWidth: StyleSheet.hairlineWidth, borderColor: "#d7d7d2", padding: 12, borderRadius: 14, marginTop: 8 },
  toolText: { color: "#676761", fontSize: 13 },
  composerWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: "rgba(247,247,245,0.97)" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, minHeight: 54, maxHeight: 140, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cfcfca", backgroundColor: "#fff", padding: 8, paddingLeft: 14 },
  input: { flex: 1, minHeight: 38, maxHeight: 120, fontSize: 15, lineHeight: 21, color: "#20201e", paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#232321", alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 21, lineHeight: 23 },
  stop: { width: 11, height: 11, borderRadius: 2, backgroundColor: "#fff" },
  disclaimer: { fontSize: 10, color: "#93938c", textAlign: "center", marginTop: 7 }
});
