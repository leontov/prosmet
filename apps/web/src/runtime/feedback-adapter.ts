import type { FeedbackAdapter } from "@assistant-ui/react";

const storageKey = "prosmet-assistant-feedback-v1";

export const feedbackAdapter: FeedbackAdapter = {
  async submit({ type, message }) {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as unknown;
      const entries = Array.isArray(stored) ? stored.slice(-199) : [];
      entries.push({
        type,
        messageId: message.id,
        createdAt: new Date().toISOString()
      });
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Feedback persistence must not block the message action.
    }
  }
};
