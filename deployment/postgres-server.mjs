import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseDir = resolve(
  process.env.PROSMET_POSTGRES_DATA_DIR || `${process.env.HOME}/.prosmet/data/postgres`
);
const port = Number(process.env.PROSMET_POSTGRES_PORT || 55432);
const user = process.env.PROSMET_POSTGRES_USER || "prosmet";
const password = process.env.PROSMET_POSTGRES_PASSWORD || "";
const databaseName = process.env.PROSMET_POSTGRES_DATABASE || "prosmet";
const readyFile = resolve(
  process.env.PROSMET_POSTGRES_READY_FILE || `${process.env.HOME}/.prosmet/postgres-ready.json`
);
const runningAsRoot =
  typeof process.getuid === "function" && process.getuid() === 0;

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error(`Invalid PostgreSQL port: ${port}`);
}
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(user)) {
  throw new Error(`Invalid PostgreSQL user: ${user}`);
}
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(databaseName)) {
  throw new Error(`Invalid PostgreSQL database: ${databaseName}`);
}
if (!password) {
  throw new Error("PROSMET_POSTGRES_PASSWORD is required");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareDataDirectory() {
  await mkdir(dirname(databaseDir), { recursive: true });
  if (await exists(resolve(databaseDir, "PG_VERSION"))) return true;
  if (!(await exists(databaseDir))) return false;

  const entries = await readdir(databaseDir);
  if (entries.length === 0) {
    await rm(databaseDir, { recursive: true, force: true });
    return false;
  }

  const archived = `${databaseDir}.invalid-${Date.now()}`;
  await rename(databaseDir, archived);
  console.error(
    `[prosmet/postgres] Existing non-cluster directory moved to ${archived}`
  );
  return false;
}

const alreadyInitialised = await prepareDataDirectory();
await mkdir(dirname(readyFile), { recursive: true });

console.log(
  `[prosmet/postgres] launcher uid=${
    typeof process.getuid === "function" ? process.getuid() : "unknown"
  } root=${runningAsRoot}`
);

const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  authMethod: "scram-sha-256",
  persistent: true,
  createPostgresUser: runningAsRoot,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: (message) => console.log(`[prosmet/postgres] ${String(message)}`),
  onError: (message) => console.error(`[prosmet/postgres] ${String(message)}`)
});

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[prosmet/postgres] stopping after ${signal}`);
  try {
    await postgres.stop();
  } catch (error) {
    console.error("[prosmet/postgres] stop failed", error);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGHUP", () => void stop("SIGHUP"));

try {
  if (!alreadyInitialised) {
    console.log(`[prosmet/postgres] initialising cluster at ${databaseDir}`);
    await postgres.initialise();
  }

  await postgres.start();

  const admin = new Client({
    host: "127.0.0.1",
    port,
    user,
    password,
    database: "postgres",
    connectionTimeoutMillis: 10_000
  });
  await admin.connect();
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}" OWNER "${user}"`);
    }
  } finally {
    await admin.end();
  }

  const connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password
  )}@127.0.0.1:${port}/${encodeURIComponent(databaseName)}`;
  const probe = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await probe.connect();
  try {
    const result = await probe.query(
      "SELECT current_database() AS database, current_user AS user, version() AS version"
    );
    await writeFile(
      readyFile,
      JSON.stringify(
        {
          ready: true,
          pid: process.pid,
          port,
          databaseDir,
          database: result.rows[0]?.database,
          user: result.rows[0]?.user,
          version: result.rows[0]?.version,
          startedAt: new Date().toISOString()
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
  } finally {
    await probe.end();
  }

  console.log(
    `[prosmet/postgres] ready on 127.0.0.1:${port}/${databaseName}`
  );
  await new Promise(() => {});
} catch (error) {
  console.error("[prosmet/postgres] fatal startup failure", error);
  await rm(readyFile, { force: true }).catch(() => undefined);
  try {
    await postgres.stop();
  } catch {
    // Preserve the original startup error.
  }
  process.exit(1);
}
