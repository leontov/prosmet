import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appPort = Number(process.env.PORT || 4173);
const fixturePort = Number(process.env.PROSMET_FIXTURE_AGENT_PORT || 4174);
const stateDirectory = await mkdtemp(join(tmpdir(), "prosmet-e2e-"));
const configFile = join(stateDirectory, "agents.json");
const children = new Set();
let stopping = false;

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping && code !== 0) {
      console.error(`${command} ${args.join(" ")} exited unexpectedly (${code ?? signal ?? "unknown"})`);
      void stop(code || 1);
    }
  });
  return child;
}

async function waitFor(url, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label} did not become ready: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  for (const child of children) {
    try { child.kill("SIGKILL"); } catch {}
  }
  await rm(stateDirectory, { recursive: true, force: true });
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => void stop(0));
}
process.on("uncaughtException", (error) => {
  console.error(error);
  void stop(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error);
  void stop(1);
});

start(process.execPath, ["e2e/fixture-agent.mjs"], {
  PROSMET_FIXTURE_AGENT_PORT: String(fixturePort)
});
await waitFor(`http://127.0.0.1:${fixturePort}/readyz`, "fixture agent");

const fixtureAgent = {
  id: "fixture",
  name: "Fixture Agent",
  kind: "openai-compatible",
  enabled: true,
  model: "fixture",
  baseUrl: `http://127.0.0.1:${fixturePort}/v1`,
  supportsTools: true,
  timeoutMs: 20_000
};

start(process.execPath, ["server.mjs"], {
  PORT: String(appPort),
  PROSMET_RELEASE_SHA: "e2e",
  PROSMET_AGENT_CONFIG_FILE: configFile,
  PROSMET_AGENT_CONFIG_KEY: "e2e-agent-config-key",
  PROSMET_ADMIN_TOKEN: "e2e-admin-token",
  PROSMET_AGENT_PROVIDERS_JSON: JSON.stringify([fixtureAgent]),
  PROSMET_DEFAULT_AGENT_ID: fixtureAgent.id
});
await waitFor(`http://127.0.0.1:${appPort}/api/health`, "Prosmet application");
console.log(`Prosmet E2E harness ready on http://127.0.0.1:${appPort}`);

await new Promise(() => {});
