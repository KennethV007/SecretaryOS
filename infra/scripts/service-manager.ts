import "dotenv/config";

import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ManagedService = {
  key: string;
  label: string;
  command: string;
  args: string[];
  enabled?: (env: NodeJS.ProcessEnv) => boolean;
};

export type StoredServiceState = {
  pid: number;
  logPath: string;
  startedAt: string;
};

export type RuntimeState = Record<string, StoredServiceState>;

export type ProcessSnapshot = {
  running: boolean;
  zombie: boolean;
  command?: string;
};

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const RUNTIME_DIR = resolve(REPO_ROOT, ".runtime");
const LOG_DIR = resolve(RUNTIME_DIR, "logs");
const STATE_PATH = resolve(RUNTIME_DIR, "services.json");
const SERVICE_ENV_OVERRIDES = {
  API_BASE_URL: "http://127.0.0.1:3001",
  NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001",
  API_PORT: "3001",
};
const STOP_TIMEOUT_MS = 5000;
const STOP_POLL_MS = 150;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function ensureRuntimeDirs(): void {
  mkdirSync(LOG_DIR, {
    recursive: true,
  });
}

export function loadState(): RuntimeState {
  if (!existsSync(STATE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as RuntimeState;
  } catch {
    return {};
  }
}

export async function saveState(state: RuntimeState): Promise<void> {
  if (Object.keys(state).length === 0) {
    if (existsSync(STATE_PATH)) {
      await unlink(STATE_PATH);
    }

    return;
  }

  ensureRuntimeDirs();
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getProcessSnapshot(pid: number): ProcessSnapshot {
  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      running: false,
      zombie: false,
    };
  }

  const result = spawnSync("ps", ["-o", "stat=,command=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const output = result.stdout.trim();

  if (!output) {
    return {
      running: false,
      zombie: false,
    };
  }

  const [line] = output
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!line) {
    return {
      running: false,
      zombie: false,
    };
  }

  const match = /^([^\s]+)\s+(.*)$/.exec(line);

  if (!match) {
    return {
      running: true,
      zombie: false,
      command: line,
    };
  }

  const [, stat, command] = match;
  const zombie = stat.includes("Z");

  return {
    running: !zombie,
    zombie,
    command: command.trim(),
  };
}

function buildServiceCommandHints(service: ManagedService): string[] {
  return [
    basename(service.command),
    ...service.args.filter(
      (arg) => !arg.startsWith("-") && /^[A-Za-z0-9_./:@+-]+$/.test(arg),
    ),
  ];
}

export function matchesManagedServiceCommand(
  service: ManagedService,
  command?: string,
): boolean {
  if (!command) {
    return false;
  }

  const hints = buildServiceCommandHints(service);

  return hints.every((hint) => command.includes(hint));
}

export function isServiceRunning(
  service: ManagedService,
  runtime: StoredServiceState,
): boolean {
  const snapshot = getProcessSnapshot(runtime.pid);

  return (
    snapshot.running && matchesManagedServiceCommand(service, snapshot.command)
  );
}

export function normalizeState(
  state: RuntimeState,
  services: ManagedService[] = SERVICES,
): RuntimeState {
  const serviceMap = new Map(services.map((service) => [service.key, service]));
  const nextState: RuntimeState = {};

  for (const [key, value] of Object.entries(state)) {
    const service = serviceMap.get(key);

    if (!service) {
      continue;
    }

    if (isServiceRunning(service, value)) {
      nextState[key] = value;
    }
  }

  return nextState;
}

function getServiceLogPath(service: ManagedService): string {
  return resolve(LOG_DIR, `${service.key}.log`);
}

function buildServiceEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    ...SERVICE_ENV_OVERRIDES,
  };
}

async function waitForProcessExit(
  pid: number,
  timeoutMs = STOP_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!getProcessSnapshot(pid).running) {
      return true;
    }

    await sleep(STOP_POLL_MS);
  }

  return !getProcessSnapshot(pid).running;
}

function trySignal(targetPid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(targetPid, signal);
    return true;
  } catch {
    return false;
  }
}

function signalManagedProcessTree(
  runtime: StoredServiceState,
  signal: NodeJS.Signals,
): boolean {
  if (runtime.pid <= 0) {
    return false;
  }

  return trySignal(-runtime.pid, signal) || trySignal(runtime.pid, signal);
}

export async function startService(
  service: ManagedService,
  state: RuntimeState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (state[service.key]) {
    console.log(
      `[start:all] ${service.label} already running with pid ${state[service.key].pid}.`,
    );
    return;
  }

  ensureRuntimeDirs();
  const logPath = getServiceLogPath(service);
  const logFd = openSync(logPath, "a");
  const child = spawn(service.command, service.args, {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: buildServiceEnv(env),
  });

  closeSync(logFd);
  child.unref();

  if (!child.pid) {
    console.log(`[start:all] failed to start ${service.label}.`);
    return;
  }

  state[service.key] = {
    pid: child.pid,
    logPath,
    startedAt: new Date().toISOString(),
  };

  await sleep(250);

  if (!isServiceRunning(service, state[service.key])) {
    delete state[service.key];
    console.log(
      `[start:all] ${service.label} exited during startup. Check ${logPath}.`,
    );
    return;
  }

  console.log(
    `[start:all] started ${service.label} with pid ${child.pid}; log: ${logPath}`,
  );
}

export async function stopService(
  service: ManagedService,
  state: RuntimeState,
): Promise<void> {
  const runtime = state[service.key];

  if (!runtime) {
    console.log(`[stop:all] ${service.label} is not running.`);
    return;
  }

  if (!isServiceRunning(service, runtime)) {
    console.log(
      `[stop:all] ${service.label} had stale state for pid ${runtime.pid}.`,
    );
    delete state[service.key];
    return;
  }

  signalManagedProcessTree(runtime, "SIGTERM");
  let stopped = await waitForProcessExit(runtime.pid);

  if (!stopped) {
    signalManagedProcessTree(runtime, "SIGKILL");
    stopped = await waitForProcessExit(runtime.pid, 1000);
  }

  if (stopped) {
    console.log(`[stop:all] stopped ${service.label} (${runtime.pid}).`);
  } else {
    console.log(
      `[stop:all] ${service.label} did not exit cleanly; removing tracked state for pid ${runtime.pid}.`,
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

async function startServices(
  services: ManagedService[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  ensureRuntimeDirs();
  const state = normalizeState(loadState(), SERVICES);

  for (const service of services) {
    if (service.enabled && !service.enabled(env)) {
      console.log(
        `[start:all] skipping ${service.label}; required environment is not configured.`,
      );
      continue;
    }

    await startService(service, state, env);
  }

  await saveState(state);
}

export async function runStartAll(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await startServices(SERVICES, env);
}

export async function runStartCore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await startServices(
    SERVICES.filter((service) => CORE_SERVICE_KEYS.has(service.key)),
    env,
  );
}

export async function runStopAll(): Promise<void> {
  const state = normalizeState(loadState(), SERVICES);

  for (const service of [...SERVICES].reverse()) {
    await stopService(service, state);
  }

  await saveState(state);
}

export async function runStatusAll(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const state = normalizeState(loadState(), SERVICES);

  for (const service of SERVICES) {
    if (service.enabled && !service.enabled(env)) {
      console.log(`[status:all] ${service.label}: disabled by configuration`);
      continue;
    }

    printStatus(service, state);
  }

  await saveState(state);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "start";

  if (mode === "start") {
    await runStartAll();
  } else if (mode === "start-core") {
    await runStartCore();
  } else if (mode === "stop") {
    await runStopAll();
  } else if (mode === "status") {
    await runStatusAll();
  } else {
    console.error(`Unknown service-manager mode: ${mode}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  });
}
