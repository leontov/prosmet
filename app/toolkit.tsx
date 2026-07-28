"use client";

import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { ActivityIcon, CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { DocumentEditor } from "@/components/tools/document-editor";
import { EstimateEditor } from "@/components/tools/estimate-editor";
import { TechnologyCard } from "@/components/tools/technology-card";
import { EstimateDraftSchema, TechnologyStepSchema } from "@/lib/domain/estimate";

const documentSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  title: z.string(),
  content: z.string(),
  missingFields: z.array(z.string()).optional(),
  status: z.enum(["draft", "approved"]).optional(),
  revision: z.number().optional()
});

const statusSchema = z.object({
  stage: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(["started", "running", "completed", "failed"]).optional()
});

export const prosmetToolkit = defineToolkit({
  technology_card: {
    description:
      "Show the complete construction technology sequence before calculating an estimate.",
    parameters: z.object({
      title: z.string().optional(),
      steps: z.array(TechnologyStepSchema)
    }),
    render: ({ args, status }) => <TechnologyCard args={args} status={status} />
  },
  estimate_draft: {
    description:
      "Show a complete editable professional estimate with technology, sections, resources, prices and totals.",
    parameters: EstimateDraftSchema,
    render: ({ args, status }) => <EstimateEditor args={args} status={status} />
  },
  commercial_proposal: {
    description: "Show an editable print-ready commercial proposal.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  contract_draft: {
    description: "Show an editable construction contract draft.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  act_draft: {
    description: "Show an editable completion act.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  ks2_draft: {
    description: "Show an editable KS-2 draft.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  ks3_draft: {
    description: "Show an editable KS-3 draft.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  m29_draft: {
    description: "Show an editable M-29 material report.",
    parameters: documentSchema,
    render: ({ args, status }) => <DocumentEditor args={args} status={status} />
  },
  workspace_status: {
    description: "Show safe professional work progress without hidden reasoning.",
    parameters: statusSchema,
    render: ({ args, status }) => {
      const running =
        status.type === "running" ||
        args.status === "running" ||
        args.status === "started";
      const failed = args.status === "failed";
      return (
        <div className="my-2 inline-flex max-w-full items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
          {running ? (
            <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
          ) : failed ? (
            <ActivityIcon className="mt-0.5 size-4 shrink-0 text-red-600" />
          ) : (
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          )}
          <div>
            <div className="font-medium text-neutral-900">
              {args.title || args.stage}
            </div>
            {args.detail && (
              <div className="mt-0.5 text-xs leading-5">{args.detail}</div>
            )}
          </div>
        </div>
      );
    }
  }
});
