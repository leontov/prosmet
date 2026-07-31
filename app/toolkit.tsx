"use client";

import { defineToolkit } from "@assistant-ui/react";
import { z } from "@/lib/zod";
import { ActivityIcon, CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { BackgroundArtifact } from "@/components/tools/background-artifact";
import { DeveloperWorkspace } from "@/components/tools/developer-workspace";
import { DocumentEditor } from "@/components/tools/document-editor";
import {
  AskUserCard,
  EstimateComparisonCard,
  ExecutionProgressCard
} from "@/components/tools/domain-artifacts";
import { EstimateExperience } from "@/components/tools/estimate-experience";
import {
  ProviderSettingsTool,
  ServiceStatusTool,
  WorkspaceSettingsTool
} from "@/components/tools/service-settings";
import { EstimateDraftSchema, TechnologyStepSchema } from "@/lib/domain/estimate";

const documentSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    missingFields: z.array(z.string()).optional(),
    status: z.enum(["draft", "approved"]).optional(),
    revision: z.number().optional()
  })
  .passthrough();

const projectCaseSchema = z
  .object({
    id: z.string().optional(),
    objectName: z.string().optional(),
    region: z.string().optional(),
    stage: z.string().optional(),
    summary: z.string().optional(),
    workTypes: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    missing: z.array(z.string()).optional()
  })
  .passthrough();

const askUserSchema = z
  .object({
    title: z.string().optional(),
    context: z.string().optional(),
    questions: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional()
  })
  .passthrough();

const reviewSchema = z
  .object({
    title: z.string().optional(),
    score: z.number().optional(),
    blockers: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    passedChecks: z.array(z.string()).optional()
  })
  .passthrough();

const comparisonSchema = z
  .object({
    title: z.string().optional(),
    currency: z.string().optional(),
    recommendation: z.string().optional(),
    options: z
      .array(
        z
          .object({
            id: z.string().optional(),
            label: z.string().optional(),
            total: z.number().optional(),
            description: z.string().optional(),
            changes: z.array(z.string()).optional(),
            recommended: z.boolean().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

const executionSchema = z
  .object({
    title: z.string().optional(),
    percent: z.number().optional(),
    currency: z.string().optional(),
    total: z.number().optional(),
    completed: z.number().optional(),
    remaining: z.number().optional(),
    notes: z.array(z.string()).optional()
  })
  .passthrough();

const resourceStatementSchema = z
  .object({
    title: z.string().optional(),
    resources: z
      .array(
        z
          .object({
            id: z.string().optional(),
            name: z.string().optional(),
            unit: z.string().optional(),
            quantity: z.number().optional(),
            type: z.string().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

const priceCandidatesSchema = z
  .object({
    title: z.string().optional(),
    currency: z.string().optional(),
    candidates: z
      .array(
        z
          .object({
            id: z.string().optional(),
            name: z.string().optional(),
            price: z.number().optional(),
            source: z.string().optional(),
            date: z.string().optional(),
            confidence: z.number().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

const statusSchema = z.object({
  stage: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(["started", "running", "completed", "failed"]).optional()
});

const workspaceSettingsSchema = z
  .object({
    section: z.enum(["profile", "estimating"]).optional()
  })
  .passthrough();

const providerSettingsSchema = z
  .object({
    providerHint: z.enum(["mimo", "openai-compatible", "ollama", "codex-cli", "rules"]).optional()
  })
  .passthrough();

const serviceStatusSchema = z
  .object({
    scope: z.string().optional()
  })
  .passthrough();

const developerWorkspaceSchema = z
  .object({
    focus: z.string().optional(),
    protocol: z.string().optional(),
    permissionMode: z.string().optional()
  })
  .passthrough();

const documentTool = (description: string) => ({
  description,
  parameters: documentSchema,
  render: ({ args, status }: { args: z.infer<typeof documentSchema>; status: { type: string } }) => (
    <DocumentEditor args={args} status={status} />
  )
});

export const prosmetToolkit = defineToolkit({
  project_case: {
    description:
      "Persist the inferred project case in the background. The normal customer view stays focused on the estimate card.",
    parameters: projectCaseSchema,
    render: ({ status }) => <BackgroundArtifact kind="project" status={status} />
  },
  ask_user: {
    description:
      "Ask only the critical questions that block a reliable estimate while preserving safe explicit assumptions.",
    parameters: askUserSchema,
    render: ({ args, status }) => <AskUserCard args={args} status={status} />
  },
  technology_card: {
    description:
      "Persist the complete construction technology sequence before calculating an estimate without expanding it in the normal chat flow.",
    parameters: z.object({
      title: z.string().optional(),
      steps: z.array(TechnologyStepSchema).optional()
    }),
    render: ({ status }) => <BackgroundArtifact kind="technology" status={status} />
  },
  resource_statement: {
    description:
      "Persist the consolidated work, material, equipment, machine and logistics resources in the background.",
    parameters: resourceStatementSchema,
    render: ({ status }) => <BackgroundArtifact kind="resources" status={status} />
  },
  price_candidates: {
    description:
      "Persist price candidates with source, date and confidence without inventing provenance or cluttering the customer thread.",
    parameters: priceCandidatesSchema,
    render: ({ status }) => <BackgroundArtifact kind="prices" status={status} />
  },
  estimate_draft: {
    description:
      "Show one compact estimate card with the total first. Open a responsive sheet for the editable professional estimate, technology, sources and client handoff.",
    parameters: EstimateDraftSchema,
    render: ({ args, status }) => (
      <EstimateExperience
        key={`${args.id || "estimate"}:${status.type}`}
        args={args}
        status={status}
      />
    )
  },
  estimate_review: {
    description:
      "Persist independent estimate review data in the background; blockers remain available inside the estimate and workspace context.",
    parameters: reviewSchema,
    render: ({ status }) => <BackgroundArtifact kind="review" status={status} />
  },
  estimate_comparison: {
    description: "Compare alternative estimate variants and explain the recommended choice.",
    parameters: comparisonSchema,
    render: ({ args, status }) => <EstimateComparisonCard args={args} status={status} />
  },
  execution_progress: {
    description: "Show partial completion, completed amount and remaining amount for the active estimate.",
    parameters: executionSchema,
    render: ({ args, status }) => <ExecutionProgressCard args={args} status={status} />
  },
  workspace_settings: {
    description:
      "Edit the tenant workspace profile, organization identity and default estimating settings without leaving the current chat.",
    parameters: workspaceSettingsSchema,
    render: ({ args, status }) => <WorkspaceSettingsTool args={args} status={status} />
  },
  provider_settings: {
    description:
      "Connect, test, select and disconnect server-side AI providers while keeping secrets outside the browser.",
    parameters: providerSettingsSchema,
    render: ({ args, status }) => <ProviderSettingsTool args={args} status={status} />
  },
  service_status: {
    description:
      "Show the live state of PostgreSQL, workspace storage, local-first sync and the selected AI provider.",
    parameters: serviceStatusSchema,
    render: ({ args, status }) => <ServiceStatusTool args={args} status={status} />
  },
  developer_workspace: {
    description:
      "Open the owner-facing A2A developer workspace, agent roster, permission contour and development task planner inside the current chat.",
    parameters: developerWorkspaceSchema,
    render: ({ args, status }) => <DeveloperWorkspace args={args} status={status} />
  },
  commercial_proposal: documentTool("Show an editable print-ready commercial proposal."),
  contract_draft: documentTool("Show an editable construction contract draft."),
  contract_appendix: documentTool("Show a contract appendix linked to the estimate."),
  act_draft: documentTool("Show an editable completion act."),
  ks2_draft: documentTool("Show an editable KS-2 draft."),
  ks3_draft: documentTool("Show an editable KS-3 draft."),
  m29_draft: documentTool("Show an editable M-29 material report."),
  defect_statement: documentTool("Show an editable defect statement."),
  material_statement: documentTool("Show an editable material statement."),
  equipment_specification: documentTool("Show an editable equipment specification."),
  work_schedule: documentTool("Show an editable work schedule."),
  invoice_draft: documentTool("Show an editable invoice draft."),
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
