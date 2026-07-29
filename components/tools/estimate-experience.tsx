"use client";

import { EstimateDocumentExperience } from "@/components/tools/estimate-document-experience";

export function EstimateExperience({
  args,
  status
}: {
  args: unknown;
  status?: { type?: string };
}) {
  return <EstimateDocumentExperience args={args} status={status} />;
}
