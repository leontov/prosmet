import { readFile } from "node:fs/promises";

const [migration, deployment, workflow] = await Promise.all([
  readFile("deployment/migrate-postgres.mjs", "utf8"),
  readFile("deployment/direct-primary.sh", "utf8"),
  readFile(".github/workflows/launch-3200.yml", "utf8")
]);

const failures = [];
const requireToken = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};

for (const token of [
  "BEGIN;",
  "COMMIT;",
  "prosmet_canonical_works",
  "prosmet_price_observations",
  "prosmet_estimate_item_price_history",
  "prosmet_user_price_profiles",
  "prosmet_organization_price_profiles",
  "prosmet_market_price_buckets",
  "prosmet_price_research_evidence",
  "CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_price_observations_tenant_id",
  "CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_price_history_tenant_id",
  "statement_timeout: 60_000"
]) {
  requireToken(migration, token, "postgres-migration");
}

requireToken(deployment, "node deployment/migrate-postgres.mjs", "immutable-deployment");
requireToken(workflow, "Migrate persistent PostgreSQL schema", "production-workflow");
requireToken(workflow, "node deployment/migrate-postgres.mjs", "production-workflow");

const deploymentMigration = deployment.indexOf("node deployment/migrate-postgres.mjs");
const deploymentPromotion = deployment.indexOf('mv "${STAGING}" "${RELEASE}"');
if (deploymentMigration < 0 || deploymentPromotion < 0 || deploymentMigration > deploymentPromotion) {
  failures.push("immutable-deployment:migration-must-precede-promotion");
}

const workflowMigration = workflow.indexOf("Migrate persistent PostgreSQL schema");
const workflowE2e = workflow.indexOf("Desktop and mobile Chromium before deployment");
const workflowDeploy = workflow.indexOf("Deploy immutable release to port 3200");
if (
  workflowMigration < 0 ||
  workflowE2e < 0 ||
  workflowDeploy < 0 ||
  workflowMigration > workflowE2e ||
  workflowMigration > workflowDeploy
) {
  failures.push("production-workflow:migration-must-precede-browser-and-deploy");
}

if (failures.length) {
  console.error("SCHEMA MIGRATION CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("SCHEMA MIGRATION CONTRACT PASS");
