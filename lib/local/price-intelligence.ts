"use client";

import { browserUuid } from "@/lib/browser/crypto";
import {
  aggregateMarketPrices,
  canonicalWorkId,
  observationFromEstimateItem,
  priceContextHash,
  priceHistoryEvent,
  priceSourceLabel,
  rankPriceCandidates,
  type MarketPriceBucket,
  type PriceCandidate,
  type PriceHistoryEvent,
  type PriceObservation,
  type PriceSourceType
} from "@/lib/domain/price-intelligence";
import type {
  EstimateDraft,
  EstimateItem,
  PriceObservationStatus,
  PriceSource
} from "@/lib/domain/estimate";
import {
  LOCAL_STORES,
  getAllByIndex,
  getAllRecords,
  requestResult,
  withLocalTransaction
} from "@/lib/local/idb";

export type LocalPriceResolution = {
  canonicalWorkId: string;
  selected: PriceCandidate | null;
  candidates: PriceCandidate[];
  personal: PriceCandidate | null;
  organization: PriceCandidate | null;
  previousEstimate: PriceCandidate | null;
  regional: PriceCandidate | null;
  official: PriceCandidate | null;
  external: PriceCandidate | null;
  market: MarketPriceBucket | null;
  needsResearch: boolean;
};

type PriceOutboxRecord = {
  id: string;
  entityType: "price";
  entityId: string;
  operation: "upsert" | "delete";
  payload: unknown;
  attempts: number;
  createdAt: string;
};

export type PriceResearchEvidence = {
  id: string;
  entityKind: "price_research_evidence";
  canonicalWorkId: string;
  rawName: string;
  unit: string;
  region: string;
  url: string;
  sourceLabel: string;
  observedPrice?: number;
  rangeLow?: number;
  rangeHigh?: number;
  currency: string;
  confidence: number;
  observedAt: string;
  rawEvidence: string;
};

function now() {
  return new Date().toISOString();
}

function outbox(payload: { id: string }) : PriceOutboxRecord {
  return {
    id: browserUuid(),
    entityType: "price",
    entityId: payload.id,
    operation: "upsert",
    payload,
    attempts: 0,
    createdAt: now()
  };
}

async function putObservation(observation: PriceObservation) {
  await withLocalTransaction(
    [LOCAL_STORES.priceObservations, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(
        transaction.objectStore(LOCAL_STORES.priceObservations).put(observation)
      );
      await requestResult(transaction.objectStore(LOCAL_STORES.outbox).put(outbox(observation)));
    }
  );
}

async function putHistory(event: PriceHistoryEvent) {
  await withLocalTransaction(
    [LOCAL_STORES.priceHistory, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(transaction.objectStore(LOCAL_STORES.priceHistory).put(event));
      await requestResult(transaction.objectStore(LOCAL_STORES.outbox).put(outbox(event)));
    }
  );
}

async function putMarketBucket(bucket: MarketPriceBucket) {
  await withLocalTransaction(
    [LOCAL_STORES.marketPriceBuckets, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(
        transaction.objectStore(LOCAL_STORES.marketPriceBuckets).put(bucket)
      );
      await requestResult(transaction.objectStore(LOCAL_STORES.outbox).put(outbox(bucket)));
    }
  );
}

function sourceTypeForStatus(item: EstimateItem, status: PriceObservationStatus): PriceSourceType {
  if (["approved", "sent_to_client", "contracted", "executed"].includes(status)) {
    return "personal";
  }
  if (item.source.kind === "organization") return "organization";
  if (item.source.kind === "previous-estimate") return "previous_estimate";
  if (item.source.kind === "supplier") return "supplier";
  if (item.source.kind === "regional") return "regional_market";
  if (item.source.kind === "official") return "official";
  if (item.source.kind === "external") return "external_research";
  return "ai_indicative";
}

export async function recordSuggestedEstimatePrices(draft: EstimateDraft) {
  for (const section of draft.sections) {
    for (const item of section.items) {
      if (!(item.unitPrice > 0) || !item.name.trim()) continue;
      const observation = observationFromEstimateItem({
        item,
        estimateId: draft.id,
        estimateRevision: draft.revision,
        region: draft.region,
        currency: draft.currency,
        status: item.source.status ?? "suggested",
        sourceType: sourceTypeForStatus(item, item.source.status ?? "suggested"),
        changedBy: item.source.status === "researched" ? "ai" : "system"
      });
      const stable = {
        ...observation,
        id: `price_observation:${draft.id}:${draft.revision}:${item.id}:${observation.status}`
      };
      await putObservation(stable);
    }
  }
}

export async function recordPriceEdit(input: {
  draft: EstimateDraft;
  item: EstimateItem;
  previousPrice: number;
  acceptedPrice: number;
  reason?: string;
}) {
  if (input.previousPrice === input.acceptedPrice) return;
  const updatedItem: EstimateItem = {
    ...input.item,
    unitPrice: input.acceptedPrice,
    canonicalWorkId:
      input.item.canonicalWorkId ??
      canonicalWorkId(input.item.name, input.item.unit, input.item.code),
    suggestedUnitPrice: input.item.suggestedUnitPrice ?? input.previousPrice,
    source: {
      ...input.item.source,
      kind: "personal",
      status: "edited",
      confirmed: false,
      label: "Изменено пользователем",
      date: new Date().toISOString().slice(0, 10)
    }
  };
  const observation = observationFromEstimateItem({
    item: updatedItem,
    estimateId: input.draft.id,
    estimateRevision: input.draft.revision,
    region: input.draft.region,
    currency: input.draft.currency,
    status: "edited",
    sourceType: "personal",
    previousPrice: input.previousPrice,
    suggestedObservationId: input.item.source.observationId,
    changedBy: "user",
    changeReason: input.reason ?? "Ручное изменение цены в редакторе"
  });
  const history = priceHistoryEvent({
    estimateId: input.draft.id,
    estimateRevision: input.draft.revision,
    item: updatedItem,
    previousPrice: input.previousPrice,
    acceptedPrice: input.acceptedPrice,
    status: "edited",
    changedBy: "user",
    changeReason: input.reason ?? "Ручное изменение цены в редакторе"
  });
  await Promise.all([putObservation(observation), putHistory(history)]);
}

export async function recordEstimatePriceStatus(
  draft: EstimateDraft,
  status: Extract<
    PriceObservationStatus,
    "approved" | "sent_to_client" | "contracted" | "executed"
  >
) {
  for (const section of draft.sections) {
    for (const item of section.items) {
      if (!(item.unitPrice > 0) || !item.name.trim()) continue;
      const observation = observationFromEstimateItem({
        item: {
          ...item,
          source: {
            ...item.source,
            kind: "personal",
            status,
            confirmed: true,
            label:
              status === "executed"
                ? "Фактическая цена выполненных работ"
                : status === "contracted"
                  ? "Цена договора"
                  : status === "sent_to_client"
                    ? "Цена, отправленная клиенту"
                    : "Утверждённая личная цена"
          }
        },
        estimateId: draft.id,
        estimateRevision: draft.revision,
        region: draft.region,
        currency: draft.currency,
        status,
        sourceType: "personal",
        changedBy: "user",
        changeReason: `Статус сметы: ${status}`
      });
      await putObservation(observation);
    }
  }
}

function firstSource(candidates: PriceCandidate[], source: PriceSourceType) {
  return candidates.find((candidate) => candidate.observation.sourceType === source) ?? null;
}

export async function resolveLocalPrice(input: {
  item: EstimateItem;
  region: string;
  currency: string;
}) : Promise<LocalPriceResolution> {
  const canonicalId =
    input.item.canonicalWorkId ?? canonicalWorkId(input.item.name, input.item.unit, input.item.code);
  const observations = await getAllByIndex<PriceObservation>(
    LOCAL_STORES.priceObservations,
    "workUnit",
    IDBKeyRange.only([canonicalId, input.item.unit])
  );
  const candidates = rankPriceCandidates({
    observations,
    canonicalWorkId: canonicalId,
    unit: input.item.unit,
    region: input.region,
    currency: input.currency,
    context: input.item.priceContext
  });
  const market = aggregateMarketPrices({
    observations,
    canonicalWorkId: canonicalId,
    unit: input.item.unit,
    region: input.region,
    context: input.item.priceContext
  });
  if (market) await putMarketBucket(market);

  const personal = firstSource(candidates, "personal");
  const organization = firstSource(candidates, "organization");
  const previousEstimate = firstSource(candidates, "previous_estimate");
  const regional = firstSource(candidates, "regional_market");
  const official = firstSource(candidates, "official");
  const external = firstSource(candidates, "external_research");
  const selected =
    personal ??
    organization ??
    previousEstimate ??
    firstSource(candidates, "supplier") ??
    regional ??
    official ??
    external ??
    candidates[0] ??
    null;

  return {
    canonicalWorkId: canonicalId,
    selected,
    candidates,
    personal,
    organization,
    previousEstimate,
    regional,
    official,
    external,
    market,
    needsResearch:
      !selected ||
      selected.score < 0.35 ||
      (market !== null && (market.sampleCount < 5 || market.confidence < 55))
  };
}

export function candidatePriceSource(candidate: PriceCandidate): PriceSource {
  return {
    label: candidate.observation.sourceLabel || priceSourceLabel(candidate.observation.sourceType),
    kind:
      candidate.observation.sourceType === "previous_estimate"
        ? "previous-estimate"
        : candidate.observation.sourceType === "regional_market"
          ? "regional"
          : candidate.observation.sourceType === "external_research"
            ? "external"
            : candidate.observation.sourceType === "ai_indicative"
              ? "indicative"
              : candidate.observation.sourceType,
    region: candidate.observation.region,
    date: candidate.observation.observedAt.slice(0, 10),
    currency: candidate.observation.currency,
    vatIncluded: candidate.observation.context.vatIncluded,
    deliveryIncluded: candidate.observation.context.deliveryIncluded,
    confidence: Math.round(candidate.observation.confidence),
    confirmed: ["approved", "sent_to_client", "contracted", "executed"].includes(
      candidate.observation.status
    ),
    observationId: candidate.observation.id,
    canonicalWorkId: candidate.observation.canonicalWorkId,
    status: candidate.observation.status,
    contextHash: candidate.observation.contextHash
  };
}

export async function listPriceHistory(estimateId: string, estimateItemId: string) {
  const events = await getAllByIndex<PriceHistoryEvent>(
    LOCAL_STORES.priceHistory,
    "estimateItem",
    IDBKeyRange.only([estimateId, estimateItemId])
  );
  return events.sort((left, right) => right.changedAt.localeCompare(left.changedAt));
}

export async function listPriceObservations() {
  return (await getAllRecords<PriceObservation>(LOCAL_STORES.priceObservations)).sort((left, right) =>
    right.observedAt.localeCompare(left.observedAt)
  );
}

export async function saveResearchEvidence(evidence: Omit<PriceResearchEvidence, "id" | "entityKind">) {
  const record: PriceResearchEvidence = {
    ...evidence,
    id: `price_research_${browserUuid()}`,
    entityKind: "price_research_evidence"
  };
  await withLocalTransaction(
    [LOCAL_STORES.priceResearchEvidence, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(
        transaction.objectStore(LOCAL_STORES.priceResearchEvidence).put(record)
      );
      await requestResult(transaction.objectStore(LOCAL_STORES.outbox).put(outbox(record)));
    }
  );
  return record;
}

export function currentPriceContextHash(item: EstimateItem) {
  return priceContextHash(item.priceContext);
}
