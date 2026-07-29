import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { executePreparedProvider } from "@/lib/server/agents/provider-executor";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        })
    )
  );
});

async function fakeProvider(
  handler: (request: IncomingMessage, response: ServerResponse) => void
) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fake provider port");
  return `http://127.0.0.1:${address.port}/v1`;
}

function prepared(baseUrl: string) {
  return {
    connection: {
      id: "provider_test_openai",
      kind: "openai-compatible" as const,
      name: "Fake provider",
      baseUrl,
      model: "fake-model",
      status: "connected" as const,
      selected: true,
      hasSecret: true,
      lastError: null,
      lastCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apiKey: "secret-test-key"
    },
    descriptor: {
      id: "provider_test_openai",
      kind: "openai-compatible" as const,
      name: "Fake provider",
      model: "fake-model"
    }
  };
}

describe("selected provider executor", () => {
  it("executes a real OpenAI-compatible HTTP request and parses the semantic result", async () => {
    let authorization = "";
    let requestBody = "";
    const baseUrl = await fakeProvider((request, response) => {
      authorization = String(request.headers.authorization ?? "");
      request.on("data", (chunk: Buffer) => {
        requestBody += chunk.toString("utf8");
      });
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: "estimate",
                    summary: "Понял объект и технологию.",
                    normalizedRequest:
                      "Составить смету механизированной штукатурки 120 м² в Казани, слой 10 мм.",
                    assumptions: [],
                    warnings: ["Уточнить этаж."],
                    confidence: 88
                  })
                }
              }
            ],
            usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 }
          })
        );
      });
    });

    const result = await executePreparedProvider(prepared(baseUrl), {
      prompt: "Составь смету штукатурки 120 м² в Казани",
      messages: [{ role: "user", content: "сообщение" }],
      state: { estimateRevision: 0 }
    });

    expect(result?.interpretation.normalizedRequest).toContain("120 м²");
    expect(result?.usage.totalTokens).toBe(200);
    expect(authorization).toBe("Bearer secret-test-key");
    expect(requestBody).toContain("Не выдумывай официальные нормы");
    expect(requestBody).not.toContain("secret-test-key");
  });

  it("cancels an active provider request through AbortSignal", async () => {
    const baseUrl = await fakeProvider((_request, response) => {
      const timer = setTimeout(() => {
        if (response.destroyed || response.writableEnded) return;
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      }, 5_000);
      response.on("close", () => clearTimeout(timer));
    });
    const controller = new AbortController();
    const run = executePreparedProvider(prepared(baseUrl), {
      prompt: "Долгий запрос",
      signal: controller.signal
    });
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses the deterministic engine only when rules is explicitly selected", async () => {
    const result = await executePreparedProvider(
      {
        connection: {
          id: "provider:rules:default",
          kind: "rules",
          name: "Встроенный сметный сервис",
          baseUrl: "",
          model: "prosmet-chief-estimator-v2",
          status: "connected",
          selected: true,
          hasSecret: false,
          lastError: null,
          lastCheckedAt: null,
          updatedAt: new Date().toISOString(),
          apiKey: ""
        },
        descriptor: {
          id: "provider:rules:default",
          kind: "rules",
          name: "Встроенный сметный сервис",
          model: "prosmet-chief-estimator-v2"
        }
      },
      { prompt: "Составь смету" }
    );
    expect(result).toBeNull();
  });
});
