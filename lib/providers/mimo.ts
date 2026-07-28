import "server-only";
import { OpenAICompatibleProvider } from "./openai-compatible";

export function createMiMoProvider() {
  const baseUrl = process.env.MIMO_API_BASE_URL;
  const apiKey = process.env.MIMO_API_KEY;
  const model = process.env.MIMO_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("MiMo is not configured. Add server-side MIMO_API_BASE_URL, MIMO_API_KEY and MIMO_MODEL; no hidden fallback will be used.");
  }
  return new OpenAICompatibleProvider({ baseUrl, apiKey, model });
}
