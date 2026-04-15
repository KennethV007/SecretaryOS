import {
  type ExecutionUsage,
  type TaskExecutor,
  createStaticExecutor,
} from "@secretaryos/codex-runtime";
import {
  type MemoryKind,
  type TaskRecord,
  createId,
  resolveMemoryScopeForTask,
} from "@secretaryos/core";
import type {
  MemoryWriteJob,
  TaskExecutionJob,
  TaskStatusEvent,
  TaskStepUpdatedEvent,
} from "@secretaryos/events";
import type { SecretaryOrchestrator } from "@secretaryos/orchestrator";
import { executeMarkdownRunbook } from "@secretaryos/skills";

export type WorkerDependencies = {
  executor: TaskExecutor;
  onTaskUpdated?: (task: TaskRecord) => Promise<void> | void;
  onTaskCompleted?: (outcome: TaskExecutionOutcome) => Promise<void> | void;
  onEvent?: (
    event: TaskStatusEvent | TaskStepUpdatedEvent,
  ) => Promise<void> | void;
  onMemoryWriteRequested?: (job: MemoryWriteJob) => Promise<void> | void;
};

export type TaskExecutionOutcome = {
  task: TaskRecord;
  outputText?: string;
  summary?: string;
  usage?: ExecutionUsage;
};

async function executeTaskWithWorkflow(
  task: TaskRecord,
  executor: TaskExecutor,
) {
  if (task.type !== "markdown_runbook_execute") {
    return executor.executeTask(task);
  }

  const runbook = await executeMarkdownRunbook(task.input, {
    cwd: process.cwd(),
  });

  return {
    taskId: task.id,
    status: "complete" as const,
    outputText: runbook.outputText,
    summary: runbook.summary,
    artifacts: [
      {
        id: createId("artifact"),
        label: "runbook-output.txt",
        content: runbook.outputText,
        mimeType: "text/plain",
      },
    ],
    usage: {
      provider: "system" as const,
      model: "markdown-runbook",
      inputTokens: Math.max(1, Math.ceil(task.input.length / 4)),
      outputTokens: Math.max(1, Math.ceil(runbook.outputText.length / 4)),
    },
  };
}

function extractLatestUserMessage(task: TaskRecord): string {
  const segments = task.input
    .split(/\n\s*\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.at(-1) ?? task.input.trim();
}

function isExplicitMemoryRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return [
    /\bremember\b/,
    /\bdon't forget\b/,
    /\bdo not forget\b/,
    /\bnote that\b/,
    /\bsave this\b/,
    /\bkeep in mind\b/,
    /\bmy preference\b/,
    /\bi prefer\b/,
    /\bcall me\b/,
    /\bmy favorite\b/,
  ].some((pattern) => pattern.test(normalized));
}

type DurableMemoryCandidate = {
  content: string;
  memoryKind: MemoryKind;
};

function extractDurableMemoryCandidate(
  text: string,
): DurableMemoryCandidate | undefined {
  const content = text.trim();
  const normalized = content.toLowerCase();

  if (!content) {
    return undefined;
  }

  if (
    /\bmy preference\b/.test(normalized) ||
    /\bi prefer\b/.test(normalized) ||
    /\bcall me\b/.test(normalized) ||
    /\bmy favorite\b/.test(normalized)
  ) {
    return {
      content,
      memoryKind: "preference",
    };
  }

  if (
    /^project note:/i.test(content) ||
    /^project:/i.test(content) ||
    /^repo note:/i.test(content)
  ) {
    return {
      content,
      memoryKind: "project",
    };
  }

  if (
    /^reminder:/i.test(content) ||
    /^remember to\b/i.test(content) ||
    /^follow up\b/i.test(content)
  ) {
    return {
      content,
      memoryKind: "event",
    };
  }

  if (isExplicitMemoryRequest(content)) {
    return {
      content,
      memoryKind: "task",
    };
  }

  return undefined;
}

function buildMemoryWriteJob(task: TaskRecord): MemoryWriteJob | undefined {
  const latestUserMessage = extractLatestUserMessage(task);
  const candidate = extractDurableMemoryCandidate(latestUserMessage);

  if (!candidate) {
    return undefined;
  }

  return {
    kind: "memory.write",
    taskId: task.id,
    content: candidate.content,
    memoryKind: candidate.memoryKind,
    scope: resolveMemoryScopeForTask({
      mode: task.mode,
      projectId: task.projectId,
    }),
    requestedAt: new Date().toISOString(),
  };
}

export async function processTaskExecutionJob(
  job: TaskExecutionJob,
  dependencies: WorkerDependencies,
): Promise<TaskExecutionOutcome> {
  if (job.task.status === "awaiting_approval") {
    await dependencies.onEvent?.({
      name: "task.awaiting_approval",
      taskId: job.task.id,
      taskType: job.task.type,
      status: "awaiting_approval",
      detail: "Task execution is paused until approval is granted.",
    });

    return {
      task: job.task,
    };
  }

  const runningTask: TaskRecord = {
    ...job.task,
    status: "running",
  };

  await dependencies.onTaskUpdated?.(runningTask);
  await dependencies.onEvent?.({
    name: "task.started",
    taskId: runningTask.id,
    taskType: runningTask.type,
    status: runningTask.status,
  });

  try {
    const result = await executeTaskWithWorkflow(
      runningTask,
      dependencies.executor,
    );
    const completedTask: TaskRecord = {
      ...runningTask,
      status: result.status,
      summary: result.summary,
    };

    await dependencies.onTaskUpdated?.(completedTask);
    await dependencies.onEvent?.({
      name: result.status === "complete" ? "task.completed" : "task.failed",
      taskId: completedTask.id,
      taskType: completedTask.type,
      status: completedTask.status,
      detail: result.outputText,
    });

    const outcome: TaskExecutionOutcome = {
      task: completedTask,
      outputText: result.outputText,
      summary: result.summary,
      usage: result.usage,
    };

    await dependencies.onTaskCompleted?.(outcome);

    const memoryWriteJob =
      result.status === "complete"
        ? buildMemoryWriteJob(completedTask)
        : undefined;

    if (memoryWriteJob) {
      await dependencies.onMemoryWriteRequested?.(memoryWriteJob);
    }

    return outcome;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Task execution failed.";
    const failedTask: TaskRecord = {
      ...runningTask,
      status: "failed",
      summary: `Execution failed for ${runningTask.type}.`,
      errorMessage: message,
      outputText: message,
    };

    await dependencies.onTaskUpdated?.(failedTask);
    await dependencies.onEvent?.({
      name: "task.failed",
      taskId: failedTask.id,
      taskType: failedTask.type,
      status: failedTask.status,
      detail: message,
    });

    const outcome: TaskExecutionOutcome = {
      task: failedTask,
      outputText: message,
      summary: failedTask.summary,
    };

    await dependencies.onTaskCompleted?.(outcome);

    return outcome;
  }
}

export function createDefaultWorkerDependencies(): WorkerDependencies {
  return {
    executor: createStaticExecutor(),
  };
}

export function createRuntimeBackedWorkerDependencies(
  runtime: SecretaryOrchestrator,
  executor: TaskExecutor = createStaticExecutor(),
): WorkerDependencies {
  return {
    executor,
    onTaskUpdated(task) {
      runtime.recordTaskUpdate(task);
    },
    onTaskCompleted(outcome) {
      runtime.recordTaskCompletion(outcome);
    },
    onMemoryWriteRequested(job) {
      runtime.recordMemoryWrite(job);
    },
  };
}
