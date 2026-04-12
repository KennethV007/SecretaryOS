import {
  type TaskExecutor,
  createCodexMcpExecutor,
} from "@secretaryos/codex-runtime";
import type {
  MemoryWriteJob,
  TaskStatusEvent,
  TaskStepUpdatedEvent,
} from "@secretaryos/events";

import type { TaskExecutionOutcome, WorkerDependencies } from "./index.js";

type WorkerApiClientConfig = {
  apiBaseUrl: string;
  internalApiKey: string;
};

async function postJson(
  config: WorkerApiClientConfig,
  path: string,
  body: unknown,
): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": config.internalApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Worker API request failed for ${path}: ${response.status} ${response.statusText}`,
    );
  }
}

export type WorkerApiClient = {
  taskUpdated(task: TaskExecutionOutcome["task"]): Promise<void>;
  taskCompleted(outcome: TaskExecutionOutcome): Promise<void>;
  memoryWriteRequested(job: MemoryWriteJob): Promise<void>;
  emitEvent(event: TaskStatusEvent | TaskStepUpdatedEvent): Promise<void>;
};

export function createWorkerApiClient(
  config: WorkerApiClientConfig,
): WorkerApiClient {
  return {
    async taskUpdated(task) {
      await postJson(config, "/internal/tasks/update", {
        task,
      });
    },
    async taskCompleted(outcome) {
      await postJson(config, "/internal/tasks/completion", {
        task: outcome.task,
        outputText: outcome.outputText,
        usage: outcome.usage,
      });
    },
    async memoryWriteRequested(job) {
      await postJson(config, "/internal/memory/write", job);
    },
    async emitEvent(_event) {
      // Event persistence stays inside the API for now. This hook is reserved for telemetry wiring.
    },
  };
}

export function createApiBackedWorkerDependencies(
  config: WorkerApiClientConfig,
  executor: TaskExecutor = createCodexMcpExecutor(),
): WorkerDependencies {
  const client = createWorkerApiClient(config);

  return {
    executor,
    onTaskUpdated(task) {
      return client.taskUpdated(task);
    },
    onTaskCompleted(outcome) {
      return client.taskCompleted(outcome);
    },
    onMemoryWriteRequested(job) {
      return client.memoryWriteRequested(job);
    },
    onEvent(event) {
      return client.emitEvent(event);
    },
  };
}
