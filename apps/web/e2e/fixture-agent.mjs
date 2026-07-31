import { createServer } from "node:http";

const port = Number(process.env.PROSMET_FIXTURE_AGENT_PORT || 4174);

const estimate = {
  id: "e2e-estimate",
  title: "Механизированная штукатурка квартиры",
  project: "Контрольный объект E2E",
  customer: "",
  region: "Казань, Республика Татарстан",
  revision: 1,
  status: "draft",
  overheadPercent: 5,
  profitPercent: 10,
  vatPercent: 0,
  updatedAt: "2026-07-31T00:00:00.000Z",
  sections: [
    {
      id: "works",
      title: "Работы",
      items: [
        { id: "work-1", name: "Механизированная штукатурка стен", unit: "м²", quantity: 358, unitPrice: 620, category: "work" },
        { id: "work-2", name: "Грунтование основания", unit: "м²", quantity: 358, unitPrice: 55, category: "work" }
      ]
    },
    {
      id: "materials",
      title: "Материалы",
      items: [
        { id: "material-1", name: "Штукатурная смесь", unit: "меш.", quantity: 197, unitPrice: 415, category: "material" }
      ]
    }
  ]
};

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function textFromMessage(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map((part) => part?.text || "").join(" ");
  return "";
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/readyz") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ ok: true }));
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404);
    return response.end();
  }

  const payload = await body(request);
  const last = [...(payload.messages || [])].reverse().find((message) => message.role === "user");
  const prompt = textFromMessage(last);
  const testRequest = /PROSMET_AGENT_OK/i.test(prompt);
  const estimateRequest = /смет|расч[её]т|цен|стоим|штукатур|ремонт|монтаж|интернет/i.test(prompt);

  const message = testRequest
    ? { role: "assistant", content: "PROSMET_AGENT_OK" }
    : estimateRequest
      ? {
          role: "assistant",
          content: "Контрольная смета создана реальным adapter path тестового окружения.",
          tool_calls: [{
            id: "call-estimate",
            type: "function",
            function: { name: "prosmet_create_estimate", arguments: JSON.stringify(estimate) }
          }]
        }
      : { role: "assistant", content: "PROSMET_FIXTURE_TEXT_OK" };

  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({
    id: "fixture-completion",
    object: "chat.completion",
    choices: [{ index: 0, finish_reason: "stop", message }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
  }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prosmet fixture agent listening on http://127.0.0.1:${port}`);
});
