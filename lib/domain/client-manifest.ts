import { z } from "@/lib/zod";

export const ClientModuleSchema = z.enum([
  "chat", "objects", "estimates", "documents", "prices", "settings", "profile", "admin"
]);

const DEFAULT_FEATURES = {
  rustApprovalGate: true,
  nativeShare: true,
  a2aDeveloperMode: false,
  priceIntelligence: true,
  documents: true
} as const;

export const ClientManifestSchema = z.object({
  version: z.number().int().positive().default(1),
  productName: z.string().trim().min(2).max(80).default("Просметчик"),
  assistantName: z.string().trim().min(2).max(80).default("Просметчик"),
  organizationName: z.string().trim().max(160).default(""),
  logoUrl: z.string().url().or(z.literal("")).default(""),
  modules: z.array(ClientModuleSchema).min(1).default(["chat", "objects", "estimates", "documents", "prices", "settings", "profile"]),
  features: z.object({
    rustApprovalGate: z.boolean().default(DEFAULT_FEATURES.rustApprovalGate),
    nativeShare: z.boolean().default(DEFAULT_FEATURES.nativeShare),
    a2aDeveloperMode: z.boolean().default(DEFAULT_FEATURES.a2aDeveloperMode),
    priceIntelligence: z.boolean().default(DEFAULT_FEATURES.priceIntelligence),
    documents: z.boolean().default(DEFAULT_FEATURES.documents)
  }).default(DEFAULT_FEATURES),
  terminology: z.record(z.string(), z.string()).default({}),
  updatedAt: z.string().default(() => new Date().toISOString())
});

export type ClientManifest = z.infer<typeof ClientManifestSchema>;
export type ClientModule = z.infer<typeof ClientModuleSchema>;

export const DEFAULT_CLIENT_MANIFEST: ClientManifest = ClientManifestSchema.parse({});
