import { ChatWorkspace } from "@/components/app/chat-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return <ChatWorkspace />;
}
