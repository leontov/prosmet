import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3200);
const releaseSha = process.env.PROSMET_RELEASE_SHA || "development";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"
};

const sampleEstimate = {
  id: "estimate-demo",
  title: "Механизированная штукатурка квартиры",
  project: "Квартира 56 · ЖК Светлый",
  customer: "Иван Петров",
  region: "Казань, Республика Татарстан",
  revision: 1,
  status: "draft",
  overheadPercent: 5,
  profitPercent: 10,
  vatPercent: 0,
  updatedAt: new Date().toISOString(),
  sections: [
    {
      id: "works",
      title: "Подготовка и основные работы",
      items: [
        { id: "i1", name: "Механизированная штукатурка стен", unit: "м²", quantity: 358, unitPrice: 620, category: "work" },
        { id: "i2", name: "Грунтование основания", unit: "м²", quantity: 358, unitPrice: 55, category: "work" },
        { id: "i3", name: "Монтаж маячкового профиля", unit: "п.м.", quantity: 240, unitPrice: 95, category: "work" },
        { id: "i4", name: "Установка перфоуголка ПВХ", unit: "п.м.", quantity: 84, unitPrice: 120, category: "work" }
      ]
    },
    {
      id: "materials",
      title: "Материалы и защита",
      items: [
        { id: "i5", name: "Штукатурная смесь", unit: "меш.", quantity: 197, unitPrice: 415, category: "material" },
        { id: "i6", name: "Защитная плёнка", unit: "м²", quantity: 118, unitPrice: 40, category: "material" }
      ]
    }
  ]
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function lastPrompt(messages) {
  const last = [...(Array.isArray(messages) ? messages : [])].reverse().find((message) => message?.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) return last.content.map((part) => part?.text || "").join(" ");
  return JSON.stringify(last.content || "");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      runtime: "node-static",
      ui: "greenfield"
    });
  }

  if (request.method === "POST" && url.pathname === "/api/agent") {
    try {
      const body = JSON.parse(await readBody(request));
      const prompt = lastPrompt(body.messages);
      const asksEstimate = /смет|расч[её]т|стоим|штукатур|ремонт|монтаж/i.test(prompt);
      return sendJson(response, 200, asksEstimate ? {
        text: "Подготовил рабочую смету. Она открылась отдельным документом: можно изменить объёмы и цены, сохранить версию, утвердить или передать клиенту.",
        artifact: "estimate",
        estimate: sampleEstimate
      } : {
        text: "Я готов работать с проектом. Опишите объект, объёмы, регион и желаемый результат — расчёт, смету, договор или комплект документов."
      });
    } catch (error) {
      return sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid request" });
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    return response.end();
  }

  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let filePath = join(root, relative || "index.html");
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    return response.end();
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(root, "index.html");
  }

  try {
    const content = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "content-type": mime[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    });
    if (request.method === "HEAD") return response.end();
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prosmet Greenfield listening on http://127.0.0.1:${port}`);
});
