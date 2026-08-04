import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState
} from "@assistant-ui/react-native";
import { CircleButton, ScreenHeader } from "../MobileChrome";
import {
  ComposeGlyph,
  CopyGlyph,
  GlobeGlyph,
  ImageGlyph,
  MenuGlyph,
  MicGlyph,
  MoreGlyph,
  PenGlyph,
  PlusGlyph,
  ShareGlyph,
  SpeakerGlyph,
  ThumbGlyph,
  VoiceGlyph
} from "../ReferenceIcons";
import { theme } from "../theme";

export type PendingPrompt = { id: number; text: string } | null;

type Props = {
  hasEstimate: boolean;
  onOpenEstimate: () => void;
  focusRequest: number;
  attentionCount: number;
  pendingPrompt: PendingPrompt;
  onPromptConsumed: () => void;
  onOpenMenu: () => void;
  onNewChat: () => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
};

type QuickAction = {
  id: "estimate" | "edit" | "search";
  title: string;
  prompt: string;
};

type MessageTimingMetadata = {
  timing?: {
    totalStreamTime?: number;
  };
};

const quickActions: QuickAction[] = [
  {
    id: "estimate",
    title: "Создать смету",
    prompt: "Составь строительную смету. Сначала уточни исходные данные и сформируй технологическую карту, затем исследуй цены и создай редактируемую смету."
  },
  {
    id: "edit",
    title: "Написать или отредактировать",
    prompt: "Помоги написать или отредактировать строительный документ, расчёт, коммерческое предложение или договор."
  },
  {
    id: "search",
    title: "Искать цены в интернете",
    prompt: "Найди и сопоставь актуальные цены на строительные работы и материалы для моего региона."
  }
];

function formatResponseDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${seconds}s`;
}

export function ChatScreen({
  hasEstimate,
  onOpenEstimate,
  focusRequest,
  attentionCount,
  pendingPrompt,
  onPromptConsumed,
  onOpenMenu,
  onNewChat,
  onOpenLibrary,
  onOpenSettings
}: Props) {
  const isEmpty = useAuiState((state) => state.thread.isEmpty);
  const [headerFocusRequest, setHeaderFocusRequest] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {isEmpty ? (
        <ScreenHeader
          title="Чат"
          titleUnderlined
          onTitlePress={onOpenMenu}
          left={<CircleButton accessibilityLabel="Открыть навигацию" onPress={onOpenMenu} badge={attentionCount}><MenuGlyph /></CircleButton>}
          right={<CircleButton accessibilityLabel="Голосовой режим" onPress={() => setHeaderFocusRequest((value) => value + 1)}><VoiceGlyph /></CircleButton>}
        />
      ) : (
        <View style={styles.conversationHeader}>
          <CircleButton accessibilityLabel="Открыть навигацию" onPress={onOpenMenu} badge={attentionCount}><MenuGlyph /></CircleButton>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Новый чат" onPress={onNewChat} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><ComposeGlyph /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Больше действий" onPress={() => setMoreOpen((value) => !value)} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><MoreGlyph /></Pressable>
          </View>
        </View>
      )}

      <ThreadPrimitive.Root style={styles.thread}>
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <ScrollView style={styles.emptyScroll} contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled" testID="native-reference-start">
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

        <MobileComposer
          focusRequest={focusRequest + headerFocusRequest}
          pendingPrompt={pendingPrompt}
          onPromptConsumed={onPromptConsumed}
        />
      </ThreadPrimitive.Root>

      {moreOpen ? (
        <View style={styles.headerMenu}>
          <Pressable onPress={() => { onNewChat(); setMoreOpen(false); }} style={styles.headerMenuRow}><Text style={styles.headerMenuText}>Новый чат</Text></Pressable>
          <Pressable onPress={() => { onOpenLibrary(); setMoreOpen(false); }} style={styles.headerMenuRow}><Text style={styles.headerMenuText}>Библиотека</Text></Pressable>
          <Pressable onPress={() => { onOpenSettings(); setMoreOpen(false); }} style={styles.headerMenuRow}><Text style={styles.headerMenuText}>Настройки</Text></Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function MobileComposer({ focusRequest, pendingPrompt, onPromptConsumed }: { focusRequest: number; pendingPrompt: PendingPrompt; onPromptConsumed: () => void }) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const aui = useAui();

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!pendingPrompt) return;
    aui.composer().setText(pendingPrompt.text);
    inputRef.current?.focus();
    const timer = setTimeout(() => {
      aui.composer().send();
      onPromptConsumed();
    }, 50);
    return () => clearTimeout(timer);
  }, [aui, onPromptConsumed, pendingPrompt]);

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ComposerPrimitive.Root style={styles.composer}>
        <Pressable style={styles.composerUtility} accessibilityRole="button" accessibilityLabel="Добавить запрос" onPress={() => inputRef.current?.focus()}><PlusGlyph /></Pressable>
        <ComposerPrimitive.Input
          ref={inputRef}
          style={styles.input}
          placeholder="Спросить Chat..."
          placeholderTextColor={theme.faint}
          multiline
          accessibilityLabel="Сообщение"
        />
        <Pressable style={styles.composerMic} accessibilityRole="button" accessibilityLabel="Голосовой ввод" onPress={() => inputRef.current?.focus()}><MicGlyph /></Pressable>
        <ComposerPrimitive.Send style={styles.send} accessibilityLabel="Отправить">
          <View style={styles.sendGlyph}><VoiceGlyph color="#ffffff" /></View>
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </View>
  );
}

function QuickActionGlyph({ id }: { id: QuickAction["id"] }) {
  if (id === "estimate") return <ImageGlyph />;
  if (id === "edit") return <PenGlyph />;
  return <GlobeGlyph />;
}

function messageText(content: unknown) {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function UserMessage() {
  const content = useAuiState((state) => state.message.content);
  return <MessagePrimitive.Root style={styles.userMessage}><View style={styles.userBubble}><Text style={styles.userText}>{messageText(content)}</Text></View></MessagePrimitive.Root>;
}

function AssistantMessage() {
  const content = useAuiState((state) => state.message.content);
  const running = useAuiState((state) => state.thread.isRunning);
  const duration = useAuiState((state) => {
    const metadata = (state.message as unknown as { metadata?: MessageTimingMetadata }).metadata;
    const value = metadata?.timing?.totalStreamTime;
    return typeof value === "number" ? value : null;
  });
  const text = useMemo(() => messageText(content), [content]);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const copy = async () => {
    const clipboard = (globalThis as unknown as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator?.clipboard;
    if (clipboard?.writeText) await clipboard.writeText(text);
    else await Share.share({ message: text });
  };

  const share = async () => { await Share.share({ message: text }); };
  const speak = () => AccessibilityInfo.announceForAccessibility(text);

  return (
    <MessagePrimitive.Root style={styles.assistantMessage}>
      <Text style={styles.processing}>{running && duration === null ? "Обработка…" : `Обработка заняла ${formatResponseDuration(duration ?? 1000)}`}</Text>
      <View style={styles.divider} />
      <Text style={styles.assistantText}>{text}</Text>
      <View style={styles.messageActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Скопировать ответ" onPress={() => void copy()} style={styles.plainAction}><CopyGlyph /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Озвучить ответ" onPress={speak} style={styles.plainAction}><SpeakerGlyph /></Pressable>
        <View style={styles.feedbackPill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Полезный ответ" onPress={() => setFeedback(feedback === "up" ? null : "up")} style={[styles.feedbackAction, feedback === "up" && styles.feedbackSelected]}><ThumbGlyph color={feedback === "up" ? theme.text : theme.muted} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Неполезный ответ" onPress={() => setFeedback(feedback === "down" ? null : "down")} style={[styles.feedbackAction, feedback === "down" && styles.feedbackSelected]}><ThumbGlyph down color={feedback === "down" ? theme.text : theme.muted} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Поделиться ответом" onPress={() => void share()} style={styles.plainAction}><ShareGlyph /></Pressable>
        <View style={styles.moreWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel="Другие действия с ответом" onPress={() => setMoreOpen((value) => !value)} style={styles.morePill}><MoreGlyph color={theme.muted} /></Pressable>
          {moreOpen ? <View style={styles.messageMenu}><Pressable onPress={() => void copy()} style={styles.messageMenuRow}><Text style={styles.messageMenuText}>Скопировать</Text></Pressable><Pressable onPress={() => void share()} style={styles.messageMenuRow}><Text style={styles.messageMenuText}>Поделиться</Text></Pressable></View> : null}
        </View>
      </View>
    </MessagePrimitive.Root>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, position: "relative", backgroundColor: theme.canvas },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  conversationHeader: { minHeight: 74, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: theme.canvas },
  headerActions: { width: 130, height: 48, flexDirection: "row", alignItems: "center", borderWidth: 1.2, borderColor: theme.borderStrong, borderRadius: 25, backgroundColor: theme.canvas, shadowColor: theme.text, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  headerAction: { width: 64, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23 },
  headerMenu: { position: "absolute", top: 66, right: 16, zIndex: 30, width: 196, borderWidth: 1, borderColor: theme.border, borderRadius: 20, backgroundColor: theme.canvas, padding: 8, shadowColor: theme.text, shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  headerMenuRow: { minHeight: 48, justifyContent: "center", borderRadius: 14, paddingHorizontal: 12 },
  headerMenuText: { color: theme.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  thread: { flex: 1 },
  emptyScroll: { flex: 1 },
  emptyContent: { flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 28, paddingBottom: 14 },
  emptySpace: { minHeight: 250, flex: 1 },
  quickActions: { gap: 14 },
  quickAction: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 3 },
  quickIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  quickText: { flex: 1, color: theme.muted, fontSize: 18, lineHeight: 23, fontWeight: "600", letterSpacing: -0.35 },
  messageList: { flex: 1 },
  messages: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  userMessage: { alignItems: "flex-end", marginBottom: 38 },
  userBubble: { maxWidth: "84%", borderRadius: 25, backgroundColor: theme.soft, paddingHorizontal: 16, paddingVertical: 12 },
  userText: { color: theme.text, fontSize: 18, lineHeight: 25, fontWeight: "600" },
  assistantMessage: { alignItems: "stretch", marginBottom: 28 },
  processing: { color: theme.faint, fontSize: 17, lineHeight: 24, fontWeight: "600", letterSpacing: -0.3 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 18, marginBottom: 22, backgroundColor: theme.border },
  assistantText: { color: theme.text, fontSize: 19, lineHeight: 28, fontWeight: "600", letterSpacing: -0.35 },
  messageActions: { minHeight: 54, flexDirection: "row", alignItems: "center", marginTop: 13 },
  plainAction: { width: 38, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, transform: [{ scale: 0.78 }] },
  feedbackPill: { height: 50, flexDirection: "row", alignItems: "center", borderRadius: 25, backgroundColor: "#e8e8e9", paddingHorizontal: 2 },
  feedbackAction: { width: 28, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, transform: [{ scale: 0.68 }] },
  feedbackSelected: { backgroundColor: "rgba(255,255,255,0.72)" },
  moreWrap: { position: "relative" },
  morePill: { width: 58, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 25, backgroundColor: "#e8e8e9", transform: [{ scale: 1 }] },
  messageMenu: { position: "absolute", right: 0, bottom: 58, zIndex: 20, width: 160, borderWidth: 1, borderColor: theme.border, borderRadius: 17, backgroundColor: theme.canvas, padding: 6, shadowColor: theme.text, shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  messageMenuRow: { minHeight: 44, justifyContent: "center", borderRadius: 12, paddingHorizontal: 10 },
  messageMenuText: { color: theme.text, fontSize: 15, fontWeight: "600" },
  artifact: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 18, backgroundColor: theme.canvas, padding: 14 },
  artifactIcon: { width: 48, height: 48, overflow: "hidden", borderRadius: 14, backgroundColor: theme.soft, color: theme.text, textAlign: "center", textAlignVertical: "center", fontSize: 20 },
  artifactCopy: { flex: 1 },
  artifactTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  artifactText: { marginTop: 5, color: theme.muted, fontSize: 13 },
  artifactAction: { color: theme.text, fontSize: 12, fontWeight: "700" },
  footer: { paddingHorizontal: 34, paddingTop: 10, backgroundColor: theme.canvas },
  composer: { minHeight: 58, flexDirection: "row", alignItems: "center", borderWidth: 1.3, borderColor: theme.borderStrong, borderRadius: 30, backgroundColor: theme.canvas, paddingHorizontal: 5, paddingVertical: 4, shadowColor: theme.text, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  composerUtility: { width: 45, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  input: { minHeight: 48, maxHeight: 126, flex: 1, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "600", paddingHorizontal: 2, paddingVertical: 10 },
  composerMic: { width: 42, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  send: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: theme.blue },
  sendGlyph: { transform: [{ scale: 0.74 }] }
});
