"use client";

import { ProsmetChatToolkit } from "@/components/chat/prosmet-toolkit";
import { ProsmetShell } from "@/components/chat/prosmet-shell";

export function ProsmetChat() {
  return (
    <ProsmetChatToolkit>
      <ProsmetShell />
    </ProsmetChatToolkit>
  );
}
