import { randomUUID } from "node:crypto";

const categories = new Set(["work", "material", "equipment", "logistics"]);
const statuses = new Set(["draft", "review", "approved", "sent"]);

export const estimateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "title",
    "project",
    "customer",
    "region",
    "revision",
    "status",
    "overheadPercent",
    "profitPercent",
    "vatPercent",
    "sections",
    "updatedAt"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    project: { type: "string" },
    customer: { type: "string" },
    region: { type: "string" },
    revision: { type: "integer", minimum: 1 },
    status: { type: "string", enum: ["draft", "review", "approved", "sent"] },
    overheadPercent: { type: "number", minimum: 0 },
    profitPercent: { type: "number", minimum: 0 },
    vatPercent: { type: "number", minimum: 0 },
    updatedAt: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "items"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "name", "unit", "quantity", "unitPrice", "category"],
              properties: {
                id: { type: "string", minLength: 1 },
                name: { type: "string", minLength: 1 },
                unit: { type: "string", minLength: 1 },
                quantity: { type: "number", minimum: 0 },
                unitPrice: { type: "number", minimum: 0 },
                category: { type: "string", enum: ["work", "material", "equipment", "logistics"] }
              }
            }
          }
        }
      }
    }
  }
};

export const agentResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "artifact", "estimate"],
  properties: {
    text: { type: "string" },
    artifact: { type: ["string", "null"], enum: ["estimate", null] },
    estimate: { anyOf: [estimateJsonSchema, { type: "null" }] }
  }
};

export const createEstimateTool = {
  type: "function",
  function: {
    name: "prosmet_create_estimate",
    description: "Return a complete editable construction estimate when the user asks for a calculation, estimate, bill of quantities, or priced work plan.",
    parameters: estimateJsonSchema
  }
};

export const baseAgentInstruction = `You are the agent connected to the Prosmet universal project workspace.
Respond in the user's language. Never claim that a price, regulation, source, test, deployment, or external fact was verified unless you actually verified it with an available tool or data source.
When the user requests a construction estimate or calculation, return the complete editable estimate through the prosmet_create_estimate tool or the normalized estimate field. Include only positions you can justify from the user's request and explicitly label assumptions in the text response.
For ordinary conversation, return text only. Do not invent an estimate artifact merely to make the interface look populated.`;

export function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (part.type === "text" && typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function normalizeMessages(messages, systemPrompt = "") {
  const normalized = [];
  const instruction = [baseAgentInstruction, systemPrompt].filter(Boolean).join("\n\n");
  if (instruction) normalized.push({ role: "system", content: instruction });

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role === "assistant" || message?.role === "system" ? message.role : "user";
    const content = textFromContent(message?.content);
    if (!content.trim()) continue;
    normalized.push({ role, content });
  }

  return normalized;
}

function finiteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid non-negative number: ${field}`);
  return number;
}

function nonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing string: ${field}`);
  return value.trim();
}

export function normalizeEstimate(input) {
  if (!input || typeof input !== "object") throw new Error("Estimate payload must be an object");
  if (!Array.isArray(input.sections) || input.sections.length === 0) throw new Error("Estimate must contain at least one section");

  const estimate = {
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : `estimate-${randomUUID()}`,
    title: nonEmptyString(input.title, "estimate.title"),
    project: typeof input.project === "string" ? input.project.trim() : "",
    customer: typeof input.customer === "string" ? input.customer.trim() : "",
    region: typeof input.region === "string" ? input.region.trim() : "",
    revision: Math.max(1, Math.trunc(Number(input.revision) || 1)),
    status: statuses.has(input.status) ? input.status : "draft",
    overheadPercent: finiteNonNegative(input.overheadPercent ?? 0, "estimate.overheadPercent"),
    profitPercent: finiteNonNegative(input.profitPercent ?? 0, "estimate.profitPercent"),
    vatPercent: finiteNonNegative(input.vatPercent ?? 0, "estimate.vatPercent"),
    updatedAt: typeof input.updatedAt === "string" && input.updatedAt.trim() ? input.updatedAt : new Date().toISOString(),
    sections: input.sections.map((section, sectionIndex) => {
      if (!section || typeof section !== "object") throw new Error(`Invalid section at index ${sectionIndex}`);
      if (!Array.isArray(section.items) || section.items.length === 0) throw new Error(`Section ${sectionIndex + 1} must contain items`);
      return {
        id: typeof section.id === "string" && section.id.trim() ? section.id.trim() : `section-${randomUUID()}`,
        title: nonEmptyString(section.title, `section[${sectionIndex}].title`),
        items: section.items.map((item, itemIndex) => {
          if (!item || typeof item !== "object") throw new Error(`Invalid item at ${sectionIndex}:${itemIndex}`);
          return {
            id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `item-${randomUUID()}`,
            name: nonEmptyString(item.name, `item[${sectionIndex}:${itemIndex}].name`),
            unit: nonEmptyString(item.unit, `item[${sectionIndex}:${itemIndex}].unit`),
            quantity: finiteNonNegative(item.quantity, `item[${sectionIndex}:${itemIndex}].quantity`),
            unitPrice: finiteNonNegative(item.unitPrice, `item[${sectionIndex}:${itemIndex}].unitPrice`),
            category: categories.has(item.category) ? item.category : "work"
          };
        })
      };
    })
  };

  return estimate;
}

export function normalizeAgentEnvelope(input, fallbackText = "") {
  if (typeof input === "string") return normalizeAgentEnvelope(parseEnvelopeText(input), fallbackText);
  if (!input || typeof input !== "object") {
    if (fallbackText.trim()) return { text: fallbackText.trim() };
    throw new Error("Agent returned an empty response");
  }

  const text = typeof input.text === "string"
    ? input.text.trim()
    : typeof input.content === "string"
      ? input.content.trim()
      : fallbackText.trim();

  const estimateCandidate = input.estimate ?? input.artifact?.estimate;
  if (estimateCandidate) {
    return {
      text: text || "Смета подготовлена и открыта как редактируемый документ.",
      artifact: "estimate",
      estimate: normalizeEstimate(estimateCandidate)
    };
  }

  if (!text) throw new Error("Agent response does not contain text or a valid artifact");
  return { text };
}

export function parseEnvelopeText(raw) {
  if (typeof raw !== "string" || !raw.trim()) return {};
  const text = raw.trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const tagged = text.match(/<prosmet-artifact[^>]*>([\s\S]*?)<\/prosmet-artifact>/i);
  if (tagged?.[1]) candidates.push(tagged[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  return { text };
}

export function extractToolEstimate(toolCalls) {
  for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
    const name = call?.function?.name ?? call?.name;
    if (name !== "prosmet_create_estimate") continue;
    const rawArguments = call?.function?.arguments ?? call?.arguments;
    const parsed = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments;
    return normalizeEstimate(parsed);
  }
  return null;
}
