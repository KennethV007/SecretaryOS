import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import type { ManagedService, RuntimeState } from "./service-manager.js";
import {
  getProcessSnapshot,
  matchesManagedServiceCommand,
  normalizeState,
  stopService,
} from "./service-manager.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function spawnDetachedProcess(
  marker: string,
): Promise<{ pid: number; service: ManagedService }> {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)", marker],
    {
      detached: true,
      stdio: "ignore",
    },
  );

  child.unref();

  if (!child.pid) {
    throw new Error("Failed to create detached test process.");
  }

  await sleep(200);

  return {
    pid: child.pid,
    service: {
      key: marker,
      label: marker,
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)", marker],
    },
  };
}

function killDetachedProcess(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
    return;
  } catch {
    // fall through
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already stopped
  }
}

test("matchesManagedServiceCommand validates expected command markers", () => {
  const service: ManagedService = {
    key: "api",
    label: "API",
    command: "pnpm",
    args: ["start:api"],
  };

  assert.equal(
    matchesManagedServiceCommand(
      service,
      "node /opt/homebrew/bin/pnpm start:api",
    ),
    true,
  );
  assert.equal(
    matchesManagedServiceCommand(
      service,
      "node /opt/homebrew/bin/pnpm start:worker",
    ),
    false,
  );
});

test("normalizeState drops stale and command-mismatched entries", async () => {
  const { pid, service } = await spawnDetachedProcess(
    "secretaryos-service-manager-normalize",
  );

  try {
    const state: RuntimeState = {
      [service.key]: {
        pid,
        logPath: "/tmp/normalize.log",
        startedAt: new Date().toISOString(),
      },
      wrong: {
        pid,
        logPath: "/tmp/wrong.log",
        startedAt: new Date().toISOString(),
      },
      stale: {
        pid: 999999,
        logPath: "/tmp/stale.log",
        startedAt: new Date().toISOString(),
      },
    };
    const normalized = normalizeState(state, [
      service,
      {
        key: "wrong",
        label: "Wrong",
        command: "pnpm",
        args: ["start:api"],
      },
      {
        key: "stale",
        label: "Stale",
        command: "pnpm",
        args: ["start:worker"],
      },
    ]);

    assert.deepEqual(Object.keys(normalized), [service.key]);
    assert.equal(normalized[service.key]?.pid, pid);
  } finally {
    killDetachedProcess(pid);
  }
});

test("stopService terminates the detached process tree and clears state", async () => {
  const { pid, service } = await spawnDetachedProcess(
    "secretaryos-service-manager-stop",
  );
  const state: RuntimeState = {
    [service.key]: {
      pid,
      logPath: "/tmp/stop.log",
      startedAt: new Date().toISOString(),
    },
  };

  await stopService(service, state);
  await sleep(200);

  assert.equal(state[service.key], undefined);
  assert.equal(getProcessSnapshot(pid).running, false);
});
