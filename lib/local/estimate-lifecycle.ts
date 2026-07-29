"use client";

import { browserUuid } from "@/lib/browser/crypto";
import type { EstimateDraft } from "@/lib/domain/estimate";
import {
  LOCAL_STORES,
  requestResult,
  withLocalTransaction
} from "@/lib/local/idb";
import { getRepository } from "@/lib/local/repository";

export async function deleteEstimateRecord(id: string) {
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
}

export async function restoreEstimateRecord(
  draft: EstimateDraft,
  threadId?: string
) {
  const restored: EstimateDraft = {
    ...draft,
    deletedAt: null,
    updatedAt: new Date().toISOString()
  };
  await (await getRepository()).saveEstimate(threadId, restored, true);
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return restored;
}
