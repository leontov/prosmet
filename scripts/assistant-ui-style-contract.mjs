import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const [
  webPackage,
  webRuntimeEntry,
  webRuntime,
  webChat,
  webStyle,
  nativePackage,
  nativeRuntime,
  nativeChat,
  nativeTheme
] = await Promise.all([
  read("apps/web/package.json"),
  read("apps/web/src/runtime/RuntimeProvider.tsx"),
  read("apps/web/src/runtime/ThreadRuntimeProvider.tsx"),
  read("apps/web/src/features/chat/ChatSurface.tsx"),
  read("apps/web/src/assistant-ui-conformance.css"),
  read("apps/mobile/package.json"),
  read("apps/mobile/src/runtime/RuntimeProvider.tsx"),
  read("apps/mobile/src/screens/ChatScreen.tsx"),
  read("apps/mobile/src/theme.ts")
]);

const failures = [];
const webRuntimeCombined = `${webRuntimeEntry}\n${webRuntime}`;

function requireTokens(scope, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
  }
}

requireTokens("web-package", webPackage, ["@assistant-ui/react"]);
requireTokens("native-package", nativePackage, ["@assistant-ui/react-native"]);

requireTokens("web-runtime", webRuntimeCombined, [
  "useLocalRuntime",
  "WebSpeechDictationAdapter",
  "WebSpeechSynthesisAdapter",
  "feedbackAdapter",
  "metadata:",
  "timing:",
  "totalStreamTime"
]);

requireTokens("web-chat", webChat, [
  "ThreadPrimitive.Messages",
  "ComposerPrimitive.Root",
  "ComposerPrimitive.Input",
  "ComposerPrimitive.Send",
  "ComposerPrimitive.Dictate",
  "ComposerPrimitive.StopDictation",
  "ActionBarPrimitive.Copy",
  "ActionBarPrimitive.Reload",
  "ActionBarPrimitive.Speak",
  "ActionBarPrimitive.StopSpeaking",
  "ActionBarPrimitive.FeedbackPositive",
  "ActionBarPrimitive.FeedbackNegative",
  "ActionBarPrimitive.ExportMarkdown",
  "ActionBarMorePrimitive.Root",
  "useMessageTiming"
]);

requireTokens("native-runtime", nativeRuntime, [
  "useLocalRuntime",
  "metadata:",
  "timing:",
  "totalStreamTime"
]);

requireTokens("native-chat", nativeChat, [
  "ThreadPrimitive.MessagesFlatList",
  "ComposerPrimitive.Root",
  "ComposerPrimitive.Input",
  "ComposerPrimitive.Send",
  "state.message as unknown as { metadata?: MessageTimingMetadata }"
]);

const sharedTokens = [
  ["text", "#111214", "--prosmet-ui-text: #111214;"],
  ["muted", "#66676a", "--prosmet-ui-muted: #66676a;"],
  ["faint", "#9a9b9e", "--prosmet-ui-faint: #9a9b9e;"],
  ["soft", "#f1f1f2", "--prosmet-ui-soft: #f1f1f2;"],
  ["border", "rgba(17,18,20,0.12)", "--prosmet-ui-border: rgba(17, 18, 20, .12);"],
  ["borderStrong", "rgba(17,18,20,0.78)", "--prosmet-ui-border-strong: rgba(17, 18, 20, .78);"],
  ["blue", "#0a84ff", "--prosmet-ui-blue: #0a84ff;"]
];

for (const [name, nativeValue, webDeclaration] of sharedTokens) {
  if (!nativeTheme.includes(`${name}: \"${nativeValue}\"`)) failures.push(`native-theme:${name}:${nativeValue}`);
  if (!webStyle.includes(webDeclaration)) failures.push(`web-theme:${name}:${webDeclaration}`);
}

for (const forbidden of ["prosmet:response-timing", "readResponseDuration", "recordResponseDuration"]) {
  if (webRuntimeCombined.includes(forbidden) || webChat.includes(forbidden) || nativeRuntime.includes(forbidden) || nativeChat.includes(forbidden)) {
    failures.push(`custom-runtime-bypass:${forbidden}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", contract: "prosmet-assistant-ui-style-v1", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-assistant-ui-style-v1",
  assistantUi: {
    web: "headless primitives plus LocalRuntime adapters in ThreadRuntimeProvider",
    native: "react-native primitives plus LocalRuntime timing metadata"
  },
  sharedVisualTokens: Object.fromEntries(sharedTokens.map(([name, value]) => [name, value])),
  messageActions: ["copy", "reload", "speech", "feedback", "export", "overflow"],
  composer: ["input", "send", "dictation", "stop-dictation"],
  customRuntimeBypasses: "absent"
}, null, 2));
