#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const envFile = process.env.PROSMET_AGENT_ENV_FILE || join(homedir(), ".prosmet-greenfield", "agent-admin.env");
const command = process.argv[2] || "status";

function parseEnv(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return values;
}

async function readValues() {
  try { return parseEnv(await readFile(envFile, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function writeValues(values) {
  await mkdir(dirname(envFile), { recursive: true, mode: 0o700 });
  const temporary = `${envFile}.${process.pid}.${Date.now()}.tmp`;
  const content = [
    `PROSMET_ADMIN_TOKEN=${values.PROSMET_ADMIN_TOKEN}`,
    `PROSMET_AGENT_CONFIG_KEY=${values.PROSMET_AGENT_CONFIG_KEY}`,
    ""
  ].join("\n");
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, envFile);
  await chmod(envFile, 0o600);
}

const values = await readValues();

if (command === "status") {
  console.log(JSON.stringify({
    envFile,
    adminTokenConfigured: Boolean(values.PROSMET_ADMIN_TOKEN),
    encryptionKeyConfigured: Boolean(values.PROSMET_AGENT_CONFIG_KEY)
  }, null, 2));
  process.exit(0);
}

if (command === "show-token") {
  if (!values.PROSMET_ADMIN_TOKEN) {
    console.error(`Super-admin token is not configured in ${envFile}`);
    process.exit(1);
  }
  process.stdout.write(`${values.PROSMET_ADMIN_TOKEN}\n`);
  process.exit(0);
}

if (command === "bootstrap" || command === "rotate-token") {
  const next = {
    PROSMET_ADMIN_TOKEN: command === "rotate-token" || !values.PROSMET_ADMIN_TOKEN
      ? randomBytes(32).toString("hex")
      : values.PROSMET_ADMIN_TOKEN,
    PROSMET_AGENT_CONFIG_KEY: values.PROSMET_AGENT_CONFIG_KEY || randomBytes(32).toString("hex")
  };
  await writeValues(next);
  console.log(JSON.stringify({
    status: "PASS",
    command,
    envFile,
    adminToken: next.PROSMET_ADMIN_TOKEN,
    encryptionKey: "configured",
    restartRequired: true
  }, null, 2));
  process.exit(0);
}

console.error("Usage: node scripts/prosmet-admin.mjs <status|show-token|bootstrap|rotate-token>");
process.exit(2);
