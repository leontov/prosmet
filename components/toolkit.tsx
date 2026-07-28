"use client";

import { defineToolkit } from "@assistant-ui/react";
import { TechnologyCardTool } from "@/components/tools/technology-card-tool";
import { EstimateDraftTool } from "@/components/tools/estimate-draft-tool";
import { EstimateReviewTool } from "@/components/tools/estimate-review-tool";
import { GenericToolCard } from "@/components/tools/generic-tool-card";

export const kolibriToolkit = defineToolkit({
  project_case: { type: "backend", render: GenericToolCard },
  file_analysis: { type: "backend", render: GenericToolCard },
  volume_takeoff: { type: "backend", render: GenericToolCard },
  technology_card: { type: "backend", render: TechnologyCardTool },
  ask_user: { type: "backend", render: GenericToolCard },
  estimate_draft: { type: "backend", render: EstimateDraftTool },
  estimate_section: { type: "backend", render: GenericToolCard },
  estimate_item: { type: "backend", render: GenericToolCard },
  estimate_recalculation: { type: "backend", render: GenericToolCard },
  estimate_review: { type: "backend", render: EstimateReviewTool },
  price_candidates: { type: "backend", render: GenericToolCard },
  price_research: { type: "backend", render: GenericToolCard },
  norm_candidates: { type: "backend", render: GenericToolCard },
  resource_statement: { type: "backend", render: GenericToolCard },
  commercial_proposal: { type: "backend", render: GenericToolCard },
  contract_draft: { type: "backend", render: GenericToolCard },
  contract_appendix: { type: "backend", render: GenericToolCard },
  act_draft: { type: "backend", render: GenericToolCard },
  ks2_draft: { type: "backend", render: GenericToolCard },
  ks3_draft: { type: "backend", render: GenericToolCard },
  m29_draft: { type: "backend", render: GenericToolCard },
  defect_statement: { type: "backend", render: GenericToolCard },
  material_statement: { type: "backend", render: GenericToolCard },
  equipment_specification: { type: "backend", render: GenericToolCard },
  work_schedule: { type: "backend", render: GenericToolCard },
  invoice_draft: { type: "backend", render: GenericToolCard },
  approval_request: { type: "backend", render: GenericToolCard },
  export_artifact: { type: "backend", render: GenericToolCard },
  workspace_status: { type: "backend", render: GenericToolCard }
});
