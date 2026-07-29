"use client";

import { EstimateDraftSchema, cloneEstimate, makeId, type EstimateDraft } from "@/lib/domain/estimate";
import { browserUuid } from "@/lib/browser/crypto";
import { LOCAL_STORES, getRecord, requestResult, withLocalTransaction } from "@/lib/local/idb";
import { getRepository } from "@/lib/local/repository";

export type DeletedEstimateSnapshot = {
  draft: EstimateDraft;
  threadId?: string;
};

type EstimateRecord = {
  id: string;
  threadId?: string;
  title: string;
  status: EstimateDraft["status"];
  revision: number;
  draft: EstimateDraft;
  createdAt: string;
  updatedAt: string;
};

export async function deleteEstimate(id: string): Promise<DeletedEstimateSnapshot | null> {
  const record = await getRecord<EstimateRecord>(LOCAL_STORES.estimates, id);
  if (!record) return null;
  const snapshot = {
    draft: EstimateDraftSchema.parse(record.draft),
    threadId: record.threadId
  };
  await withLocalTransaction(
    [LOCAL_STORES.estimates, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(transaction.objectStore(LOCAL_STORES.estimates).delete(id));
      await requestResult(
        transaction.objectStore(LOCAL_STORES.outbox).put({
          id: browserUuid(),
          entityType: "estimate",
          entityId: id,
          operation: "delete",
          payload: null,
          attempts: 0,
          createdAt: new Date().toISOString()
        })
      );
    }
  );
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return snapshot;
}

export async function restoreEstimate(snapshot: DeletedEstimateSnapshot) {
  await (await getRepository()).saveEstimate(snapshot.threadId, snapshot.draft, false);
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return snapshot.draft;
}

export async function duplicateEstimate(threadId: string | undefined, draft: EstimateDraft) {
  const duplicate = cloneEstimate(draft);
  duplicate.id = makeId("estimate");
  duplicate.title = `${draft.title} — копия`;
  duplicate.status = "draft";
  duplicate.revision = 1;
  duplicate.updatedAt = new Date().toISOString();
  for (const section of duplicate.sections) {
    section.id = makeId("section");
    for (const item of section.items) item.id = makeId("item");
  }
  await (await getRepository()).saveEstimate(threadId, duplicate, false);
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return duplicate;
}
