import Decimal from "decimal.js";
import { z } from "zod";
import { makeId, PriceObservationStatusSchema, type EstimateItem } from "@/lib/domain/estimate";

export const PriceSourceTypeSchema = z.enum([
  "personal",
  "organization",
  "previous_estimate",
  "supplier",
  "regional_market",
  "official",
  "external_research",
  "ai_indicative"
]);

export const PriceContextSchema = z.object({
  materialsIncluded: z.boolean().default(false),
  deliveryIncluded: z.boolean().default(false),
  equipmentIncluded: z.boolean().default(false),
  vatIncluded: z.boolean().default(false),
  layerThicknessMm: z.number().finite().nonnegative().optional(),
  constrainedConditions: z.boolean().default(false),
  floor: z.number().int().optional(),
  qualityLevel: z.string().default("standard"),
  urgency: z.string().default("normal"),
  season: z.string().default("")
});

export const PriceObservationSchema = z.object({
  id: z.string().min(1),
  entityKind: z.literal("price_observation").default("price_observation"),
  canonicalWorkId: z.string().min(1),
  rawName: z.string().min(1),
  code: z.string().default(""),
  price: z.number().finite().nonnegative(),
  currency: z.string().default("RUB"),
  unit: z.string().min(1),
  region: z.string().default(""),
  sourceType: PriceSourceTypeSchema,
  sourceId: z.string().optional(),
  sourceLabel: z.string().default(""),
  userId: z.string().optional(),
  organizationId: z.string().optional(),
  estimateId: z.string().optional(),
  estimateRevision: z.number().int().positive().optional(),
  estimateItemId: z.string().optional(),
  suggestedObservationId: z.string().optional(),
  previousPrice: z.number().finite().nonnegative().optional(),
  observedAt: z.string().datetime(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  context: PriceContextSchema.default({}),
  contextHash: z.string().min(1),
  confidence: z.number().min(0).max(100).default(0),
  status: PriceObservationStatusSchema,
  changedBy: z.enum(["ai", "user", "organization", "system"]).default("system"),
  changeReason: z.string().default(""),
  evidenceUrl: z.string().url().optional(),
  evidenceDate: z.string().optional(),
  createdAt: z.string().datetime()
});

export const MarketPriceBucketSchema = z.object({
  id: z.string().min(1),
  entityKind: z.literal("market_price_bucket").default("market_price_bucket"),
  canonicalWorkId: z.string().min(1),
  unit: z.string().min(1),
  region: z.string().default(""),
  timeBucket: z.string().min(1),
  contextHash: z.string().min(1),
  p25: z.number().finite().nonnegative(),
  median: z.number().finite().nonnegative(),
  p75: z.number().finite().nonnegative(),
  trimmedMean: z.number().finite().nonnegative(),
  sampleCount: z.number().int().nonnegative(),
  uniqueUsers: z.number().int().nonnegative(),
  uniqueOrganizations: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(100),
  updatedAt: z.string().datetime()
});

export const PriceHistoryEventSchema = z.object({
  id: z.string().min(1),
  entityKind: z.literal("price_history").default("price_history"),
  estimateId: z.string().min(1),
  estimateRevision: z.number().int().positive(),
  estimateItemId: z.string().min(1),
  canonicalWorkId: z.string().min(1),
  previousPrice: z.number().finite().nonnegative(),
  acceptedPrice: z.number().finite().nonnegative(),
  suggestedObservationId: z.string().optional(),
  changedBy: z.enum(["ai", "user", "organization", "system"]),
  changeReason: z.string().default(""),
  status: PriceObservationStatusSchema,
  changedAt: z.string().datetime()
});

export type PriceSourceType = z.infer<typeof PriceSourceTypeSchema>;
export type PriceContext = z.infer<typeof PriceContextSchema>;
export type PriceObservation = z.infer<typeof PriceObservationSchema>;
export type MarketPriceBucket = z.infer<typeof MarketPriceBucketSchema>;
export type PriceHistoryEvent = z.infer<typeof PriceHistoryEventSchema>;

export type PriceCandidate = {
  observation: PriceObservation;
  score: number;
  sourceWeight: number;
  recencyWeight: number;
  regionWeight: number;
  contextWeight: number;
  statusWeight: number;
};

const sourceWeights: Record<PriceSourceType, number> = {
  personal: 1,
  organization: 0.96,
  previous_estimate: 0.92,
  supplier: 0.84,
  regional_market: 0.78,
  official: 0.74,
  external_research: 0.62,
  ai_indicative: 0.42
};

const statusWeights: Record<z.infer<typeof PriceObservationStatusSchema>, number> = {
  researched: 0.45,
  suggested: 0.52,
  edited: 0.68,
  approved: 0.82,
  sent_to_client: 0.9,
  contracted: 0.96,
  executed: 1,
  rejected: 0.08,
  stale: 0.2,
  suspicious: 0
};

export function normalizePriceText(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stableToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function canonicalWorkId(name: string, unit: string, code = "") {
  const normalized = normalizePriceText(`${code} ${name} ${unit}`);
  return `work_${stableToken(normalized)}`;
}

export function normalizePriceContext(context?: Partial<PriceContext>): PriceContext {
  return PriceContextSchema.parse(context ?? {});
}

export function priceContextHash(context?: Partial<PriceContext>) {
  const value = normalizePriceContext(context);
  return `ctx_${stableToken(
    JSON.stringify({
      materialsIncluded: value.materialsIncluded,
      deliveryIncluded: value.deliveryIncluded,
      equipmentIncluded: value.equipmentIncluded,
      vatIncluded: value.vatIncluded,
      layerThicknessMm: value.layerThicknessMm ?? null,
      constrainedConditions: value.constrainedConditions,
      floor: value.floor ?? null,
      qualityLevel: normalizePriceText(value.qualityLevel),
      urgency: normalizePriceText(value.urgency),
      season: normalizePriceText(value.season)
    })
  )}`;
}

export function observationFromEstimateItem(input: {
  item: EstimateItem;
  estimateId: string;
  estimateRevision: number;
  region: string;
  currency: string;
  status: z.infer<typeof PriceObservationStatusSchema>;
  sourceType?: PriceSourceType;
  previousPrice?: number;
  suggestedObservationId?: string;
  changedBy?: PriceObservation["changedBy"];
  changeReason?: string;
  observedAt?: string;
}) {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const context = normalizePriceContext(input.item.priceContext);
  const canonicalId =
    input.item.canonicalWorkId ?? canonicalWorkId(input.item.name, input.item.unit, input.item.code);
  return PriceObservationSchema.parse({
    id: makeId("price_observation"),
    canonicalWorkId: canonicalId,
    rawName: input.item.name,
    code: input.item.code,
    price: input.item.unitPrice,
    currency: input.currency,
    unit: input.item.unit,
    region: input.region,
    sourceType: input.sourceType ?? sourceTypeFromItem(input.item),
    sourceId: input.item.source.observationId,
    sourceLabel: input.item.source.label,
    estimateId: input.estimateId,
    estimateRevision: input.estimateRevision,
    estimateItemId: input.item.id,
    suggestedObservationId: input.suggestedObservationId,
    previousPrice: input.previousPrice,
    observedAt,
    context,
    contextHash: priceContextHash(context),
    confidence: input.item.source.confidence,
    status: input.status,
    changedBy: input.changedBy ?? "system",
    changeReason: input.changeReason ?? "",
    createdAt: observedAt
  });
}

export function priceHistoryEvent(input: {
  estimateId: string;
  estimateRevision: number;
  item: EstimateItem;
  previousPrice: number;
  acceptedPrice: number;
  status: z.infer<typeof PriceObservationStatusSchema>;
  changedBy: PriceHistoryEvent["changedBy"];
  changeReason?: string;
}) {
  return PriceHistoryEventSchema.parse({
    id: makeId("price_history"),
    estimateId: input.estimateId,
    estimateRevision: input.estimateRevision,
    estimateItemId: input.item.id,
    canonicalWorkId:
      input.item.canonicalWorkId ?? canonicalWorkId(input.item.name, input.item.unit, input.item.code),
    previousPrice: input.previousPrice,
    acceptedPrice: input.acceptedPrice,
    suggestedObservationId: input.item.source.observationId,
    changedBy: input.changedBy,
    changeReason: input.changeReason ?? "",
    status: input.status,
    changedAt: new Date().toISOString()
  });
}

function sourceTypeFromItem(item: EstimateItem): PriceSourceType {
  switch (item.source.kind) {
    case "personal":
      return "personal";
    case "organization":
      return "organization";
    case "previous-estimate":
      return "previous_estimate";
    case "supplier":
      return "supplier";
    case "regional":
      return "regional_market";
    case "official":
      return "official";
    case "external":
      return "external_research";
    default:
      return "ai_indicative";
  }
}

function daysBetween(left: string, right = new Date().toISOString()) {
  const delta = Math.max(0, new Date(right).getTime() - new Date(left).getTime());
  return delta / 86_400_000;
}

function recencyWeight(observedAt: string) {
  return Math.max(0.18, Math.exp(-daysBetween(observedAt) / 365));
}

function regionWeight(candidate: string, requested: string) {
  const left = normalizePriceText(candidate);
  const right = normalizePriceText(requested);
  if (!right) return 0.72;
  if (left === right) return 1;
  if (left && (left.includes(right) || right.includes(left))) return 0.84;
  if (!left) return 0.58;
  return 0.42;
}

function contextSimilarity(left: PriceContext, right: PriceContext) {
  const booleanKeys: (keyof Pick<
    PriceContext,
    | "materialsIncluded"
    | "deliveryIncluded"
    | "equipmentIncluded"
    | "vatIncluded"
    | "constrainedConditions"
  >)[] = [
    "materialsIncluded",
    "deliveryIncluded",
    "equipmentIncluded",
    "vatIncluded",
    "constrainedConditions"
  ];
  let score = 1;
  for (const key of booleanKeys) if (left[key] !== right[key]) score *= 0.78;
  if (
    left.layerThicknessMm !== undefined &&
    right.layerThicknessMm !== undefined &&
    Math.abs(left.layerThicknessMm - right.layerThicknessMm) > 5
  ) {
    score *= 0.72;
  }
  if (left.floor !== undefined && right.floor !== undefined && Math.abs(left.floor - right.floor) > 3) {
    score *= 0.82;
  }
  if (normalizePriceText(left.qualityLevel) !== normalizePriceText(right.qualityLevel)) score *= 0.86;
  if (normalizePriceText(left.urgency) !== normalizePriceText(right.urgency)) score *= 0.88;
  if (left.season && right.season && normalizePriceText(left.season) !== normalizePriceText(right.season)) {
    score *= 0.88;
  }
  return Math.max(0.2, score);
}

export function rankPriceCandidates(input: {
  observations: readonly PriceObservation[];
  canonicalWorkId: string;
  unit: string;
  region: string;
  context?: Partial<PriceContext>;
  currency?: string;
}) {
  const context = normalizePriceContext(input.context);
  return input.observations
    .filter(
      (observation) =>
        observation.canonicalWorkId === input.canonicalWorkId &&
        observation.unit === input.unit &&
        (!input.currency || observation.currency === input.currency) &&
        observation.status !== "rejected" &&
        observation.status !== "suspicious"
    )
    .map<PriceCandidate>((observation) => {
      const sourceWeight = sourceWeights[observation.sourceType];
      const recency = recencyWeight(observation.observedAt);
      const regional = regionWeight(observation.region, input.region);
      const contextWeight = contextSimilarity(observation.context, context);
      const statusWeight = statusWeights[observation.status];
      const confidenceWeight = Math.max(0.25, observation.confidence / 100);
      return {
        observation,
        sourceWeight,
        recencyWeight: recency,
        regionWeight: regional,
        contextWeight,
        statusWeight,
        score: sourceWeight * recency * regional * contextWeight * statusWeight * confidenceWeight
      };
    })
    .sort((left, right) => right.score - left.score || right.observation.observedAt.localeCompare(left.observation.observedAt));
}

function percentile(values: readonly number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * ratio;
  const base = Math.floor(position);
  const fraction = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + fraction * (next - sorted[base]);
}

function roundMoney(value: number) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function aggregateMarketPrices(input: {
  observations: readonly PriceObservation[];
  canonicalWorkId: string;
  unit: string;
  region: string;
  context?: Partial<PriceContext>;
  timeBucket?: string;
}) {
  const ranked = rankPriceCandidates({
    ...input,
    currency: undefined
  }).filter((candidate) =>
    ["regional_market", "external_research", "supplier", "personal", "organization"].includes(
      candidate.observation.sourceType
    )
  );
  const raw = ranked.map((candidate) => candidate.observation.price).filter((price) => price > 0);
  if (!raw.length) return null;

  const q1 = percentile(raw, 0.25);
  const q3 = percentile(raw, 0.75);
  const iqr = q3 - q1;
  const lower = Math.max(0, q1 - iqr * 1.5);
  const upper = q3 + iqr * 1.5;
  const filtered = raw.filter((price) => price >= lower && price <= upper);
  const sorted = [...filtered].sort((left, right) => left - right);
  const trim = sorted.length >= 10 ? Math.max(1, Math.floor(sorted.length * 0.1)) : 0;
  const trimmed = trim ? sorted.slice(trim, sorted.length - trim) : sorted;
  const trimmedMean = trimmed.reduce((sum, price) => sum + price, 0) / trimmed.length;
  const uniqueUsers = new Set(
    ranked.map((candidate) => candidate.observation.userId).filter(Boolean)
  ).size;
  const uniqueOrganizations = new Set(
    ranked.map((candidate) => candidate.observation.organizationId).filter(Boolean)
  ).size;
  const confidence = Math.min(
    96,
    Math.round(28 + Math.min(filtered.length, 40) * 1.2 + Math.min(uniqueOrganizations, 20) * 1.1)
  );
  const contextHash = priceContextHash(input.context);
  const timeBucket = input.timeBucket ?? new Date().toISOString().slice(0, 7);

  return MarketPriceBucketSchema.parse({
    id: `market_${stableToken(
      `${input.canonicalWorkId}:${input.unit}:${normalizePriceText(input.region)}:${timeBucket}:${contextHash}`
    )}`,
    canonicalWorkId: input.canonicalWorkId,
    unit: input.unit,
    region: input.region,
    timeBucket,
    contextHash,
    p25: roundMoney(percentile(filtered, 0.25)),
    median: roundMoney(percentile(filtered, 0.5)),
    p75: roundMoney(percentile(filtered, 0.75)),
    trimmedMean: roundMoney(trimmedMean),
    sampleCount: filtered.length,
    uniqueUsers,
    uniqueOrganizations,
    confidence,
    updatedAt: new Date().toISOString()
  });
}

export function priceSourceLabel(sourceType: PriceSourceType) {
  const labels: Record<PriceSourceType, string> = {
    personal: "Личная",
    organization: "Организация",
    previous_estimate: "Предыдущая смета",
    supplier: "Поставщик",
    regional_market: "Рынок региона",
    official: "Официальная",
    external_research: "Внешнее исследование",
    ai_indicative: "Ориентировочная"
  };
  return labels[sourceType];
}
