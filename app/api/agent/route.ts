import { randomUUID } from "node:crypto";
import { runRulesAgent } from "@/lib/server/rules-agent";
import { resolveServerIdentity } from "@/lib/server/identity";
import { beginAgentRun, finishAgentRun } from "@/lib/server/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const MAX_BODY_BYTES = Math.max(
  2 * 1024 * 1024,
  Math.min(
    24 * 1024 * 1024,
    Number(process.env.PROSMET_AGENT_MAX_REQUEST_BYTES) || 16 * 1024 * 1024
  )
);

function event(payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("request_body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return "{}";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("request_body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textParts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    const item = asRecord(part);
    if (item.type === "text" && typeof item.text === "string") return [item.text];
    return [];
  });
}

function latestUserText(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = asRecord(messages[index]);
    if (message.role === "user") return textParts(message.content).join("\n").trim();
  }
  return "";
}

function requestSummary(body: Record<string, unknown>, prompt: string) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools)
    ? body.tools
        .map((tool) => asRecord(tool).name)
        .filter((name): name is string => typeof name === "string")
    : [];
  return {
    prompt: prompt.slice(0, 16_000),
    messageCount: messages.length,
    tools,
    hasState: Boolean(body.state && typeof body.state === "object"),
    receivedAt: new Date().toISOString()
  };
}

function splitText(value: string) {
  const chunks: string[] = [];
  const words = value.split(/(\s+)/);
  let current = "";
  for (const word of words) {
    current += word;
    if (current.length >= 34 || /[.!?]\s*$/.test(current)) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitJson(value: unknown) {
  const json = JSON.stringify(value);
  const size = Math.max(60, Math.ceil(json.length / 12));
  const chunks: string[] = [];
  for (let offset = 0; offset < json.length; offset += size) {
    chunks.push(json.slice(offset, offset + size));
  }
  return chunks;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = asRecord(JSON.parse(await readBody(request)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    return Response.json(
      {
        error: code,
        message:
          code === "request_body_too_large"
            ? "Размер запроса превышает допустимый лимит."
            : "Некорректный AG-UI запрос."
      },
      { status: code === "request_body_too_large" ? 413 : 400 }
    );
  }

  const threadId =
    typeof body.threadId === "string" && body.threadId
      ? body.threadId
      : randomUUID();
  const runId =
    typeof body.runId === "string" && body.runId ? body.runId : randomUUID();
  const prompt = latestUserText(body);
  const provider = process.env.PROSMET_DEFAULT_PROVIDER || "rules";
  const identity = resolveServerIdentity(request);

  try {
    await beginAgentRun({
      tenantId: identity.ownerId,
      runId,
      threadId,
      provider,
      model: provider === "rules" ? "prosmet-rules-v1" : undefined,
      request: requestSummary(body, prompt)
    });
  } catch (error) {
    return Response.json(
      {
        error: "agent_backend_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Серверная база запусков недоступна."
      },
      { status: 503 }
    );
  }

  const result = runRulesAgent(prompt);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(event(payload));
      const activityMessageId = randomUUID();
      const sendActivity = (content: Record<string, unknown>) =>
        send({
          type: "ACTIVITY_SNAPSHOT",
          messageId: activityMessageId,
          activityType: "work_trace",
          content
        });

      try {
        send({ type: "RUN_STARTED", threadId, runId });
        send({
          type: "STATE_SNAPSHOT",
          snapshot: {
            project: {},
            activeEstimate: null,
            estimateRevision: 0,
            documents: [],
            priceContext: {},
            workTrace: [],
            sync: { status: "server-connected" },
            provider: { id: provider, status: "available" },
            validation: {}
          }
        });
        sendActivity({
          stage: "analysis",
          title: "Анализ исходных данных",
          status: "running"
        });

        await sleep(80, request.signal);
        const messageId = randomUUID();
        send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        for (const chunk of splitText(result.text)) {
          send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: chunk });
          await sleep(28, request.signal);
        }
        send({ type: "TEXT_MESSAGE_END", messageId });

        for (const [index, tool] of result.tools.entries()) {
          sendActivity({
            stage: tool.name,
            title:
              tool.name === "technology_card"
                ? "Определение технологии"
                : tool.name === "estimate_draft"
                  ? "Формирование и проверка сметы"
                  : "Подготовка документа",
            status: "running",
            position: index + 1,
            total: result.tools.length
          });
          const toolCallId = randomUUID();
          send({
            type: "TOOL_CALL_START",
            toolCallId,
            toolCallName: tool.name,
            parentMessageId: messageId
          });
          for (const delta of splitJson(tool.args)) {
            send({ type: "TOOL_CALL_ARGS", toolCallId, delta });
            await sleep(12, request.signal);
          }
          send({ type: "TOOL_CALL_END", toolCallId });
        }

        send({ type: "STATE_SNAPSHOT", snapshot: result.state });
        sendActivity({
          stage: "complete",
          title: "Результат готов",
          status: "completed"
        });
        send({ type: "RUN_FINISHED", threadId, runId });
        await finishAgentRun({
          tenantId: identity.ownerId,
          runId,
          status: "completed",
          result: {
            textLength: result.text.length,
            tools: result.tools.map((tool) => tool.name),
            stateKeys: Object.keys(result.state)
          }
        });
      } catch (error) {
        if (request.signal.aborted) {
          await finishAgentRun({
            tenantId: identity.ownerId,
            runId,
            status: "cancelled"
          }).catch(() => undefined);
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "Не удалось выполнить запрос Просметчика.";
          send({
            type: "RUN_ERROR",
            threadId,
            runId,
            code: "agent_run_failed",
            message
          });
          await finishAgentRun({
            tenantId: identity.ownerId,
            runId,
            status: "failed",
            error: message
          }).catch(() => undefined);
        }
      } finally {
        controller.close();
      }
    }
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Prosmet-Provider": provider
  });
  if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);

  return new Response(stream, { headers });
}
