"use client";

import {
  EstimateDraftSchema,
  type EstimateDraft
} from "@/lib/domain/estimate";
import { getAllRecords, LOCAL_STORES } from "@/lib/local/idb";

export type LocalEstimateEntry = {
  id: string;
  threadId?: string;
  title: string;
  status: EstimateDraft["status"];
  revision: number;
  draft: EstimateDraft;
  createdAt: string;
  updatedAt: string;
};

type StoredEstimate = {
  id: string;
  threadId?: string;
  title: string;
  status: EstimateDraft["status"];
  revision: number;
  draft: unknown;
  createdAt: string;
  updatedAt: string;
};

export async function listEstimateEntries(): Promise<LocalEstimateEntry[]> {
  const records = await getAllRecords<StoredEstimate>(LOCAL_STORES.estimates);
  return records
    .flatMap((record) => {
      const parsed = EstimateDraftSchema.safeParse(record.draft);
      if (!parsed.success) return [];
      return [
        {
          id: record.id,
          threadId: record.threadId,
          title: record.title || parsed.data.title,
          status: parsed.data.status,
          revision: parsed.data.revision,
          draft: parsed.data,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        } satisfies LocalEstimateEntry
      ];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
