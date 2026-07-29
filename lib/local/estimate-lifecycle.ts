"use client";

import { browserUuid } from "@/lib/browser/crypto";
import type { EstimateDraft } from "@/lib/domain/estimate";
import {
  LOCAL_STORES,
  requestResult,
  withLocalTransaction
} from "@/lib/local/idb";
import { ProsmetRepository } from "@/lib/local/repository";

declare module "@/lib/local/repository" {
  interface ProsmetRepository {
    deleteEstimate(id: string): Promise<void>;
    restoreEstimate(draft: EstimateDraft, threadId?: string): Promise<EstimateDraft>;
  }
}

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
  await ProsmetRepository.prototype.saveEstimate.call(
    await Promise.resolve(new ProsmetRepository()),
    threadId,
    restored,
    true
  );
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return restored;
}

ProsmetRepository.prototype.deleteEstimate = async function deleteEstimate(id: string) {
  await deleteEstimateRecord(id);
};

ProsmetRepository.prototype.restoreEstimate = async function restoreEstimate(
  draft: EstimateDraft,
  threadId?: string
) {
  const restored: EstimateDraft = {
    ...draft,
    deletedAt: null,
    updatedAt: new Date().toISOString()
  };
  await this.saveEstimate(threadId, restored, true);
  window.dispatchEvent(new Event("prosmet:local-data-changed"));
  return restored;
};
