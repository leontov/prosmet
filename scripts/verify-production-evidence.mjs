import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [evidenceDirectory, expectedReleaseSha] = process.argv.slice(2);

if (!evidenceDirectory || !expectedReleaseSha) {
  throw new Error("Usage: node scripts/verify-production-evidence.mjs <evidence-directory> <release-sha>");
}

const requiredProjects = new Set(["desktop-chromium", "mobile-chromium"]);
const requiredChecks = [
  "health",
  "browserShell",
  "activeAgentResponse",
  "artifactReference",
  "sqliteArtifact",
  "persistedRead",
  "persistedEdit",
  "reloadRestored"
];
const requiredInfrastructureChecks = [
  "survivedRunnerCleanup",
  "canonicalEdgeReloaded",
  "allResolvedIpv4Checked",
  "externalDns",
  "externalHttps",
  "publicRoot",
  "publicHealth"
];

const filenames = (await readdir(evidenceDirectory))
  .filter((filename) => /^production-critical-path-.+\.json$/.test(filename))
  .sort();
const entries = await Promise.all(filenames.map(async (filename) => {
  const path = join(evidenceDirectory, filename);
  return JSON.parse(await readFile(path, "utf8"));
}));

const failures = [];
const seenProjects = new Set();
let infrastructure = null;
try {
  infrastructure = JSON.parse(await readFile(join(evidenceDirectory, "infrastructure.json"), "utf8"));
} catch {
  failures.push("Missing infrastructure evidence");
}
for (const check of requiredInfrastructureChecks) {
  if (infrastructure?.[check] !== true) failures.push(`Missing infrastructure PASS for ${check}`);
}

for (const entry of entries) {
  const project = String(entry?.project || "");
  if (!requiredProjects.has(project)) {
    failures.push(`Unexpected or missing project in evidence: ${project || "unknown"}`);
    continue;
  }
  if (seenProjects.has(project)) failures.push(`Duplicate evidence for ${project}`);
  seenProjects.add(project);
  if (entry?.scope !== "production") failures.push(`${project}: scope must be production`);
  if (entry?.releaseSha !== expectedReleaseSha) {
    failures.push(`${project}: release SHA ${String(entry?.releaseSha)} does not match ${expectedReleaseSha}`);
  }
  if (entry?.origin !== "https://kolibriai.online") {
    failures.push(`${project}: origin must be https://kolibriai.online`);
  }
  for (const check of requiredChecks) {
    if (entry?.checks?.[check] !== true) failures.push(`${project}: missing PASS for ${check}`);
  }
  if (!entry?.artifact?.id || entry?.artifact?.database !== "sqlite") {
    failures.push(`${project}: missing SQLite artifact evidence`);
  }
  if (!Number.isInteger(entry?.artifact?.revisionBeforeEdit) || !Number.isInteger(entry?.artifact?.revisionAfterEdit)) {
    failures.push(`${project}: missing artifact revision evidence`);
  } else if (entry.artifact.revisionAfterEdit <= entry.artifact.revisionBeforeEdit) {
    failures.push(`${project}: edited revision did not increase`);
  }
}

for (const project of requiredProjects) {
  if (!seenProjects.has(project)) failures.push(`Missing production evidence for ${project}`);
}

const acceptance = {
  status: failures.length ? "FAIL" : "PASS",
  releaseSha: expectedReleaseSha,
  ui: "greenfield",
  origin: "https://kolibriai.online",
  criteria: {
    activeAgentResponse: entries.every((entry) => entry?.checks?.activeAgentResponse === true),
    sqliteTransactionAndArtifact: entries.every((entry) => entry?.checks?.sqliteArtifact === true),
    artifactReference: entries.every((entry) => entry?.checks?.artifactReference === true),
    persistedRead: entries.every((entry) => entry?.checks?.persistedRead === true),
    persistedEdit: entries.every((entry) => entry?.checks?.persistedEdit === true),
    reloadRestored: entries.every((entry) => entry?.checks?.reloadRestored === true),
    desktopChromium: entries.some((entry) => entry?.project === "desktop-chromium" && entry?.checks?.browserShell === true),
    mobileChromium: entries.some((entry) => entry?.project === "mobile-chromium" && entry?.checks?.browserShell === true),
    infrastructure: requiredInfrastructureChecks.every((check) => infrastructure?.[check] === true)
  },
  infrastructure,
  evidence: entries.map((entry) => ({
    project: entry.project,
    artifact: entry.artifact,
    generatedAt: entry.generatedAt
  })),
  failures
};

await mkdir(evidenceDirectory, { recursive: true });
await writeFile(join(evidenceDirectory, "production-critical-path-acceptance.json"), `${JSON.stringify(acceptance, null, 2)}\n`);

if (failures.length) {
  for (const failure of failures) console.error(`Production evidence failure: ${failure}`);
  process.exitCode = 1;
}
