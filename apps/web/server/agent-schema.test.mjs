import assert from "node:assert/strict";
import test from "node:test";
import {
  extractToolEstimate,
  normalizeAgentEnvelope,
  normalizeEstimate,
  normalizeMessages,
  parseEnvelopeText
} from "./agent-schema.mjs";

const estimate = {
  id: "estimate-test",
  title: "Тестовая смета",
  project: "Объект",
  customer: "Заказчик",
  region: "Казань",
  revision: 1,
  status: "draft",
  overheadPercent: 5,
  profitPercent: 10,
  vatPercent: 0,
  updatedAt: "2026-07-31T00:00:00.000Z",
  sections: [{
    id: "works",
    title: "Работы",
    items: [{
      id: "item-1",
      name: "Штукатурка стен",
      unit: "м²",
      quantity: 10,
      unitPrice: 600,
      category: "work"
    }]
  }]
};

test("normalizes assistant-ui messages without leaking unsupported parts", () => {
  const messages = normalizeMessages([
    { role: "user", content: [{ type: "text", text: "Составь смету" }, { type: "image", image: "ignored" }] },
    { role: "assistant", content: "Уточните регион" }
  ], "Use verified prices only");

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Use verified prices only/);
  assert.deepEqual(messages.slice(1), [
    { role: "user", content: "Составь смету" },
    { role: "assistant", content: "Уточните регион" }
  ]);
});

test("normalizes a complete editable estimate", () => {
  const normalized = normalizeEstimate({ ...estimate, sections: [{ ...estimate.sections[0], items: [{ ...estimate.sections[0].items[0], quantity: "10" }] }] });
  assert.equal(normalized.sections[0].items[0].quantity, 10);
  assert.equal(normalized.sections[0].items[0].unitPrice, 600);
  assert.equal(normalized.status, "draft");
});

test("rejects negative or incomplete estimate positions", () => {
  assert.throws(() => normalizeEstimate({ ...estimate, sections: [{ ...estimate.sections[0], items: [{ ...estimate.sections[0].items[0], quantity: -1 }] }] }), /non-negative/);
  assert.throws(() => normalizeEstimate({ ...estimate, sections: [] }), /at least one section/);
});

test("extracts estimate tool calls from OpenAI-compatible responses", () => {
  const result = extractToolEstimate([{ function: { name: "prosmet_create_estimate", arguments: JSON.stringify(estimate) } }]);
  assert.equal(result?.id, "estimate-test");
  assert.equal(result?.sections[0].items[0].name, "Штукатурка стен");
});

test("parses JSON envelopes and keeps ordinary text as text", () => {
  assert.deepEqual(parseEnvelopeText("Обычный ответ"), { text: "Обычный ответ" });
  const envelope = normalizeAgentEnvelope(`\`\`\`json\n${JSON.stringify({ text: "Готово", artifact: "estimate", estimate })}\n\`\`\``);
  assert.equal(envelope.artifact, "estimate");
  assert.equal(envelope.estimate.id, "estimate-test");
});
