import { execFile, spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { platform } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_SETTINGS_PATH,
  loadSettings,
  saveSettings,
} from "@secretaryos/settings";
import { config as loadDotenv } from "dotenv";

import { bootstrapServices } from "./bootstrap-services.js";
import { runConfigureFlow } from "./configure.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const ENV_PATH = resolve(REPO_ROOT, ".env");

type EnvFile = {
  lines: string[];
  values: Record<string, string>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("bash", [
      "-lc",
      `command -v ${JSON.stringify(command)}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

function parseEnvFile(filePath: string): EnvFile {
  const raw = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = raw ? raw.split(/\r?\n/) : [];
  const values: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, value] = match;
    values[key] = value;
  }

  return {
    lines,
    values,
  };
}

function setEnvValue(envFile: EnvFile, key: string, value: string): void {
  const nextLine = `${key}=${value}`;
  const lineIndex = envFile.lines.findIndex((line) =>
    line.startsWith(`${key}=`),
  );

  envFile.values[key] = value;

  if (lineIndex >= 0) {
    envFile.lines[lineIndex] = nextLine;
    return;
  }

  envFile.lines.push(nextLine);
}

function saveEnvFile(filePath: string, envFile: EnvFile): void {
  const contents = `${envFile.lines.filter(Boolean).join("\n")}\n`;
  writeFileSync(filePath, contents, "utf8");
}

function refreshProcessEnv(): void {
  loadDotenv({
    path: ENV_PATH,
    override: true,
  });
}

async function isPortReachable(
  port: number,
  host = "127.0.0.1",
): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({
      host,
      port,
    });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let candidate = startPort;

  while (await isPortReachable(candidate)) {
    candidate += 1;
  }

  return candidate;
}

async function ensureDotEnv(): Promise<void> {
  if (existsSync(ENV_PATH)) {
    return;
  }

  copyFileSync(resolve(REPO_ROOT, ".env.example"), ENV_PATH);
  console.log("[setup] created .env from .env.example");
}

async function syncInfraPorts(): Promise<void> {
  const envFile = parseEnvFile(ENV_PATH);
  const currentPostgresPort = Number(
    envFile.values.POSTGRES_HOST_PORT ?? "5432",
  );
  const currentRedisPort = Number(envFile.values.REDIS_HOST_PORT ?? "6379");

  const postgresInUse = await isPortReachable(currentPostgresPort);
  const redisInUse = await isPortReachable(currentRedisPort);
  const databaseUrl = envFile.values.DATABASE_URL ?? "";
  const redisUrl = envFile.values.REDIS_URL ?? "";
  const alreadyAligned =
    databaseUrl.includes(`localhost:${currentPostgresPort}/secretary_os`) &&
    redisUrl === `redis://localhost:${currentRedisPort}`;

  if (alreadyAligned && postgresInUse && redisInUse) {
    refreshProcessEnv();
    return;
  }

  const postgresPort = await findAvailablePort(currentPostgresPort);
  const redisPort = await findAvailablePort(currentRedisPort);

  if (postgresPort !== currentPostgresPort) {
    console.log(
      `[setup] postgres host port ${currentPostgresPort} is already in use; switching SecretaryOS Postgres to ${postgresPort}.`,
    );
  }

  if (redisPort !== currentRedisPort) {
    console.log(
      `[setup] redis host port ${currentRedisPort} is already in use; switching SecretaryOS Redis to ${redisPort}.`,
    );
  }

  setEnvValue(envFile, "POSTGRES_HOST_PORT", String(postgresPort));
  setEnvValue(envFile, "REDIS_HOST_PORT", String(redisPort));
  setEnvValue(
    envFile,
    "DATABASE_URL",
    `postgresql://postgres:postgres@localhost:${postgresPort}/secretary_os`,
  );
  setEnvValue(envFile, "REDIS_URL", `redis://localhost:${redisPort}`);
  saveEnvFile(ENV_PATH, envFile);
  refreshProcessEnv();
}

async function dockerDaemonAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"]);
    return true;
  } catch {
    return false;
  }
}

async function ensureDockerDaemon(): Promise<boolean> {
  if (!(await commandExists("docker"))) {
    console.log(
      "[setup] docker not found; install Docker Desktop to run local Postgres and Redis.",
    );
    return false;
  }

  if (await dockerDaemonAvailable()) {
    return true;
  }

  if (platform() === "darwin" && (await commandExists("open"))) {
    console.log("[setup] docker daemon is not running; opening Docker.app");

    try {
      await execFileAsync("open", ["-a", "Docker"]);
    } catch {
      return false;
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await dockerDaemonAvailable()) {
        console.log("[setup] docker daemon is ready");
        return true;
      }

      await sleep(1000);
    }
  }

  console.log("[setup] docker daemon is not running.");
  return false;
}

async function startDockerServices(): Promise<boolean> {
  const dockerReady = await ensureDockerDaemon();

  if (!dockerReady) {
    return false;
  }

  await execFileAsync("docker", [
    "compose",
    "-f",
    "infra/docker/compose.yaml",
    "up",
    "-d",
  ]);
  console.log("[setup] docker services started");
  return true;
}

async function waitForServicePort(
  label: string,
  port: number,
  timeoutMs = 60_000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortReachable(port)) {
      console.log(`[setup] ${label} is reachable on localhost:${port}`);
      return;
    }

    await sleep(1000);
  }

  throw new Error(
    `${label} did not become reachable on localhost:${port} within ${timeoutMs / 1000}s.`,
  );
}

async function runDatabaseMigrations(): Promise<void> {
  console.log("[setup] applying database migrations");

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("pnpm", ["db:migrate"], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
      },
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`Database migrations failed with exit code ${code}.`));
    });
  });

  console.log("[setup] database migrations applied");
}

async function printCommandChecks(): Promise<void> {
  for (const command of ["node", "pnpm", "python3", "docker", "codex"]) {
    const available = await commandExists(command);
    console.log(`[setup] ${command}: ${available ? "found" : "missing"}`);
  }
}

export async function runSetupFlow(): Promise<void> {
  await ensureDotEnv();
  refreshProcessEnv();
  await syncInfraPorts();
  await printCommandChecks();

  const dockerStarted = await startDockerServices();

  if (dockerStarted) {
    await waitForServicePort(
      "Postgres",
      Number(process.env.POSTGRES_HOST_PORT ?? "5432"),
    );
    await waitForServicePort(
      "Redis",
      Number(process.env.REDIS_HOST_PORT ?? "6379"),
    );
    await runDatabaseMigrations();
  }

  console.log("[setup] bootstrapping local Python services");
  await bootstrapServices();

  const settings = loadSettings({
    createIfMissing: true,
  });

  saveSettings(settings, {
    filePath: process.env.SETTINGS_PATH ?? DEFAULT_SETTINGS_PATH,
  });
  console.log("[setup] ensured config/settings.json exists");
  console.log("[setup] opening interactive configuration");

  await runConfigureFlow();
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  runSetupFlow().catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
