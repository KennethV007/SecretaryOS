import "dotenv/config";

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ManagedService = {
  key: string;
  label: string;
  command: string;
  args: string[];
  enabled?: (env: NodeJS.ProcessEnv) => boolean;
};

type StoredServiceState = {
  pid: number;
  logPath: string;
  startedAt: string;
};

type RuntimeState = Record<string, StoredServiceState>;

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const RUNTIME_DIR = resolve(REPO_ROOT, ".runtime");
const LOG_DIR = resolve(RUNTIME_DIR, "logs");
const STATE_PATH = resolve(RUNTIME_DIR, "services.json");

const SERVICES: ManagedService[] = [
  {
    key: "api",
    label: "API",
    command: "pnpm",
    args: ["start:api"],
  },
  {
    key: "worker",
    label: "Worker",
    command: "pnpm",
    args: ["start:worker"],
  },
  {
    key: "dashboard",
    label: "Dashboard",
    command: "pnpm",
    args: ["start:dashboard"],
  },
  {
    key: "gateway",
    label: "Discord Gateway",
    command: "pnpm",
    args: ["start:gateway"],
    enabled: (env) => Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_CLIENT_ID),
  },
];

const CORE_SERVICE_KEYS = new Set(["api", "worker", "gateway"]);

function ensureRuntimeDirs(): void {
  mkdirSync(LOG_DIR, {
    recursive: true,
  });
}

function loadState(): RuntimeState {
  if (!existsSync(STATE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as RuntimeState;
  } catch {
    return {};
  }
}

function saveState(state: RuntimeState): void {
  ensureRuntimeDirs();
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeState(state: RuntimeState): RuntimeState {
  const nextState: RuntimeState = {};

  for (const [key, value] of Object.entries(state)) {
    if (isPidRunning(value.pid)) {
      nextState[key] = value;
    }
  }

  return nextState;
}

function getServiceLogPath(service: ManagedService): string {
  return resolve(LOG_DIR, `${service.key}.log`);
}

function startService(service: ManagedService, state: RuntimeState): void {
  if (state[service.key]) {
    console.log(
      `[start:all] ${service.label} already running with pid ${state[service.key].pid}.`,
    );
    return;
  }

  const logPath = getServiceLogPath(service);
  const logFd = openSync(logPath, "a");
  const child = spawn(service.command, service.args, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      API_BASE_URL: "http://127.0.0.1:3001",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001",
      API_PORT: "3001",
    },
  });

  child.unref();

  state[service.key] = {
    pid: child.pid ?? -1,
    logPath,
    startedAt: new Date().toISOString(),
  };

  console.log(
    `[start:all] started ${service.label} with pid ${child.pid ?? "unknown"}; log: ${logPath}`,
  );
}

function stopService(service: ManagedService, state: RuntimeState): void {
  const runtime = state[service.key];

  if (!runtime) {
    console.log(`[stop:all] ${service.label} is not running.`);
    return;
  }

  try {
    process.kill(runtime.pid, "SIGTERM");
    console.log(`[stop:all] stopped ${service.label} (${runtime.pid}).`);
  } catch {
    console.log(
      `[stop:all] ${service.label} pid ${runtime.pid} was not running.`,
    );
  }

  delete state[service.key];
}

function printStatus(service: ManagedService, state: RuntimeState): void {
  const runtime = state[service.key];

  if (!runtime) {
    console.log(`[status:all] ${service.label}: stopped`);
    return;
  }

  console.log(
    `[status:all] ${service.label}: running (pid ${runtime.pid}) log=${runtime.logPath}`,
  );
}

function startServices(
  services: ManagedService[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  ensureRuntimeDirs();
  const state = normalizeState(loadState());

  for (const service of services) {
    if (service.enabled && !service.enabled(env)) {
      console.log(
        `[start:all] skipping ${service.label}; required environment is not configured.`,
      );
      continue;
    }

    startService(service, state);
  }

  saveState(state);
}

export function runStartAll(env: NodeJS.ProcessEnv = process.env): void {
  startServices(SERVICES, env);
}

export function runStartCore(env: NodeJS.ProcessEnv = process.env): void {
  startServices(
    SERVICES.filter((service) => CORE_SERVICE_KEYS.has(service.key)),
    env,
  );
}

export function runStopAll(): void {
  const state = normalizeState(loadState());

  for (const service of [...SERVICES].reverse()) {
    stopService(service, state);
  }

  if (Object.keys(state).length === 0 && existsSync(STATE_PATH)) {
    unlinkSync(STATE_PATH);
    return;
  }

  saveState(state);
}

export function runStatusAll(env: NodeJS.ProcessEnv = process.env): void {
  const state = normalizeState(loadState());

  for (const service of SERVICES) {
    if (service.enabled && !service.enabled(env)) {
      console.log(`[status:all] ${service.label}: disabled by configuration`);
      continue;
    }

    printStatus(service, state);
  }

  saveState(state);
}

const mode = process.argv[2] ?? "start";

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  if (mode === "start") {
    runStartAll();
  } else if (mode === "start-core") {
    runStartCore();
  } else if (mode === "stop") {
    runStopAll();
  } else if (mode === "status") {
    runStatusAll();
  } else {
    console.error(`Unknown service-manager mode: ${mode}`);
    process.exitCode = 1;
  }
}
