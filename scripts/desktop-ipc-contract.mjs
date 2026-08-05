import { readFile } from "node:fs/promises";

const [library, commands, main, cargo, capability, tauriConfig, desktopPackage] = await Promise.all([
  readFile(new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/src-tauri/src/commands.rs", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/src-tauri/src/main.rs", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/src-tauri/capabilities/default.json", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../apps/desktop/package.json", import.meta.url), "utf8")
]);

const failures = [];
const requiredCommands = ["get_app_metadata", "calculate_estimate", "calculate_line"];
for (const command of requiredCommands) {
  if (!commands.includes(`fn ${command}`)) failures.push(`desktop-ipc:command-missing:${command}`);
  if (!library.includes(`commands::${command}`)) failures.push(`desktop-ipc:handler-missing:${command}`);
}

for (const forbidden of [
  "execute_shell",
  "run_command",
  "read_any_file",
  "write_any_file",
  "Command::new(",
  "std::process::Command",
  "shell:allow-execute",
  "fs:allow-home-read-recursive",
  "fs:allow-home-write-recursive"
]) {
  if (`${library}\n${commands}\n${main}\n${capability}`.includes(forbidden)) {
    failures.push(`desktop-ipc:forbidden-capability:${forbidden}`);
  }
}

for (const token of [
  "deny_unknown_fields",
  "MAX_ESTIMATE_LINES",
  "PERCENTAGE_LIMIT_EXCEEDED",
  "CALCULATION_OVERFLOW",
  "PROSMET_GIT_SHA"
]) {
  if (!library.includes(token)) failures.push(`desktop-ipc:validation-missing:${token}`);
}

const capabilityJson = JSON.parse(capability);
if (JSON.stringify(capabilityJson.permissions) !== JSON.stringify(["core:default"])) {
  failures.push("desktop-ipc:capability-is-not-core-default-only");
}
if (JSON.stringify(capabilityJson.windows) !== JSON.stringify(["main"])) {
  failures.push("desktop-ipc:capability-window-scope-invalid");
}

const config = JSON.parse(tauriConfig);
const csp = String(config.app?.security?.csp || "");
for (const token of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
  if (!csp.includes(token)) failures.push(`desktop-security:csp-token-missing:${token}`);
}
for (const forbidden of ["unsafe-eval", "script-src *", "connect-src *"]) {
  if (csp.includes(forbidden)) failures.push(`desktop-security:csp-weakened:${forbidden}`);
}

for (const token of [
  "serde = { version = \"1\", features = [\"derive\"] }",
  "prosmet-estimate-engine"
]) {
  if (!cargo.includes(token)) failures.push(`desktop-build:dependency-missing:${token}`);
}

const packageJson = JSON.parse(desktopPackage);
for (const script of [
  "desktop:dev",
  "desktop:build",
  "desktop:test",
  "desktop:lint",
  "desktop:security",
  "desktop:verify"
]) {
  if (!packageJson.scripts?.[script]) failures.push(`desktop-build:script-missing:${script}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-desktop-ipc-v1",
  commands: requiredCommands,
  commandModule: "isolated",
  capability: capabilityJson.identifier,
  permissions: capabilityJson.permissions,
  csp: "strict",
  forbiddenIpc: "absent"
}, null, 2));
