import { createServer } from "node:http";

const port = Number(process.env.FIXTURE_AGENT_PORT || 4174);

const fixtureEstimate = {
  id: "estimate-e2e-agent",
  title: "Механизированная штукатурка 358 м²",
  project: "Тестовый объект из запроса",
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
        { id: "work-2", name: "Грунтование основания", unit: "м²", quantity: 358, unitPrice: 55, category: "work" },
        { id: "work-3", name: "Монтаж маячкового профиля", unit: "п.м.", quantity: 240, unitPrice: 95, category: "work" }
      ]
    },
    {
      id: "materials",
      title: "Материалы",
      items: [
        { id: "material-1", name: "Штукатурная смесь", unit: "меш.", quantity: 197, unitPrice: 415, category: "material" },
        { id: "material-2", name: "Защитная плёнка", unit: "м²", quantity: 118, unitPrice: 40, category: "material" }
      ]
    }
  ]
};

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    return response.end(JSON.stringify({ ok: true, fixture: "http-agent" }));
  }

  if (request.method !== "POST" || request.url !== "/run") {
    response.writeHead(404, { "content-type": "application/json" });
    return response.end(JSON.stringify({ error: "not_found" }));
  }

  const body = await readJson(request);
  const prompt = (Array.isArray(body.messages) ? body.messages : [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content || ""))
    .join("\n");

  const result = /Проверь соединение/i.test(prompt)
    ? { text: "OK", artifact: null, estimate: null }
    : /смет|расч|штукатур|ремонт/i.test(prompt)
      ? {
          text: "Смета подготовлена внешним HTTP-агентом и открыта в редакторе.",
          artifact: "estimate",
          estimate: fixtureEstimate
        }
      : {
          text: "Запрос обработан внешним HTTP-агентом. Для сметы укажите вид работ, объём и регион.",
          artifact: null,
          estimate: null
        };

  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(result));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prosmet HTTP agent fixture listening on http://127.0.0.1:${port}`);
});
