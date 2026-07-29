import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");
const server = resolve(standalone, "server.js");
const staticSource = resolve(root, ".next/static");
const staticTarget = resolve(standalone, ".next/static");
const publicSource = resolve(root, "public");
const publicTarget = resolve(standalone, "public");

await access(server);
await access(staticSource);
await rm(staticTarget, { recursive: true, force: true });
await mkdir(resolve(standalone, ".next"), { recursive: true });
await cp(staticSource, staticTarget, { recursive: true, force: true });

try {
  await access(publicSource);
  await rm(publicTarget, { recursive: true, force: true });
  await cp(publicSource, publicTarget, { recursive: true, force: true });
} catch {
  // Public assets are optional for Next.js, but copied whenever present.
}

const child = spawn(process.execPath, [server], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: process.env.PORT || process.env.PROSMET_E2E_PORT || "13110"
  }
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGHUP", () => forward("SIGHUP"));

child.on("error", (error) => {
  console.error("Unable to start the standalone E2E server", error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
