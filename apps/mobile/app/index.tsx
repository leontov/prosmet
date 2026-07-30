import { AssistantRuntimeProvider } from "@assistant-ui/react-native";
import { NativeWorkspace } from "@/src/components/native-workspace";
import { useProsmetRuntime } from "@/src/runtime";

export default function HomeScreen() {
  const runtime = useProsmetRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NativeWorkspace />
    </AssistantRuntimeProvider>
  );
}
