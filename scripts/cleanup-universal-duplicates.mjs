import fs from "node:fs";

const edits = [
  {
    path: "components/app/premium-chat-workspace.tsx",
    replacements: [
      [
        'import { useClientManifest } from "@/lib/client/use-client-manifest";\nimport { useClientManifest } from "@/lib/client/use-client-manifest";',
        'import { useClientManifest } from "@/lib/client/use-client-manifest";'
      ],
      [
        '  const { manifest, hasModule } = useClientManifest();\n  const { manifest, hasModule } = useClientManifest();',
        '  const { manifest, hasModule } = useClientManifest();'
      ]
    ]
  },
  {
    path: "components/app/premium-prosmet-application.tsx",
    replacements: [
      [
        'import { verifyEstimateWithRust } from "@/lib/client/rust-engine";\nimport { verifyEstimateWithRust } from "@/lib/client/rust-engine";',
        'import { verifyEstimateWithRust } from "@/lib/client/rust-engine";'
      ]
    ]
  },
  {
    path: "app/api/providers/route.ts",
    replacements: [
      [
        'import { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";\nimport { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";',
        'import { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";'
      ]
    ]
  },
  {
    path: "lib/server/agents/provider-executor.ts",
    replacements: [
      [
        'import { runCodexAppServerSemantic } from "@/lib/server/agents/codex-app-server";\nimport { runA2ACompatible, runAgUiCompatible } from "@/lib/server/agents/universal-protocols";\nimport { runCodexAppServerSemantic } from "@/lib/server/agents/codex-app-server";\nimport { runA2ACompatible, runAgUiCompatible } from "@/lib/server/agents/universal-protocols";',
        'import { runCodexAppServerSemantic } from "@/lib/server/agents/codex-app-server";\nimport { runA2ACompatible, runAgUiCompatible } from "@/lib/server/agents/universal-protocols";'
      ],
      [
        '  if (connection.kind === "codex-app-server") {\n    return runCodexAppServerSemantic({ ...input, model: connection.model, resumeSessionId: input.resumeSessionId });\n  }\n  if (connection.kind === "a2a") return runA2ACompatible(connection, input);\n  if (connection.kind === "ag-ui") return runAgUiCompatible(connection, input);\n  if (connection.kind === "codex-app-server") {\n    return runCodexAppServerSemantic({ ...input, model: connection.model, resumeSessionId: input.resumeSessionId });\n  }\n  if (connection.kind === "a2a") return runA2ACompatible(connection, input);\n  if (connection.kind === "ag-ui") return runAgUiCompatible(connection, input);',
        '  if (connection.kind === "codex-app-server") {\n    return runCodexAppServerSemantic({ ...input, model: connection.model, resumeSessionId: input.resumeSessionId });\n  }\n  if (connection.kind === "a2a") return runA2ACompatible(connection, input);\n  if (connection.kind === "ag-ui") return runAgUiCompatible(connection, input);'
      ]
    ]
  },
  {
    path: "lib/server/services/providers.ts",
    replacements: [
      [
        'import { checkCodexAppServer } from "@/lib/server/agents/codex-app-server";\nimport { probeUniversalAgent } from "@/lib/server/agents/universal-protocols";\nimport { checkCodexAppServer } from "@/lib/server/agents/codex-app-server";\nimport { probeUniversalAgent } from "@/lib/server/agents/universal-protocols";',
        'import { checkCodexAppServer } from "@/lib/server/agents/codex-app-server";\nimport { probeUniversalAgent } from "@/lib/server/agents/universal-protocols";'
      ],
      [
        '  "codex-app-server",\n  "a2a",\n  "ag-ui",\n  "codex-app-server",\n  "a2a",\n  "ag-ui"',
        '  "codex-app-server",\n  "a2a",\n  "ag-ui"'
      ]
    ]
  },
  {
    path: "components/tools/service-settings.tsx",
    replacements: [
      [
        'form.kind !== "rules" && form.kind !== "codex-cli" && form.kind !== "codex-app-server" && form.kind !== "codex-app-server"',
        'form.kind !== "rules" && form.kind !== "codex-cli" && form.kind !== "codex-app-server"'
      ]
    ]
  },
  {
    path: "deployment/migrate-postgres.mjs",
    replacements: [
      [
`CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
`CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`
      ]
    ]
  }
];

let changed = 0;
for (const edit of edits) {
  if (!fs.existsSync(edit.path)) continue;
  let source = fs.readFileSync(edit.path, "utf8");
  const original = source;
  for (const [before, after] of edit.replacements) {
    source = source.replace(before, after);
  }
  if (source !== original) {
    fs.writeFileSync(edit.path, source);
    changed += 1;
    console.log(`cleaned ${edit.path}`);
  }
}

console.log(`universal duplicate cleanup complete (${changed} files changed)`);
