"use client";

import { memo } from "react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

export const MarkdownText = memo(function MarkdownText() {
  return <MarkdownTextPrimitive className="prose-message" />;
});
