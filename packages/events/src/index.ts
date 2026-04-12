import { Queue } from "bullmq";

import type {
  EventName,
  MemoryScope,
  TaskRecord,
  TaskStatus,
  TaskStepStatus,
  TaskType,
} from "@secretaryos/core";

export const TASK_QUEUE_NAME = "secretary.tasks";
export const MEMORY_QUEUE_NAME = "secretary.memory";
export const PROACTIVE_QUEUE_NAME = "secretary.proactive";

export type TaskStatusEvent = {
  name: EventName;
  taskId: string;
  taskType?: TaskType;
  status: TaskStatus;
  detail?: string;
};

export type TaskStepUpdatedEvent = {
  name: "task.step.updated";
  taskId: string;
  stepId: string;
  status: TaskStepStatus;
  detail?: string;
};

export type TaskExecutionJob = {
  kind: "task.execute";
  task: TaskRecord;
  requestedAt: string;
};

export type ApprovalResumeJob = {
  kind: "task.resume_after_approval";
  taskId: string;
  approvalId: string;
  requestedAt: string;
};

export type MemoryWriteJob = {
  kind: "memory.write";
  taskId: string;
  content: string;
  scope: MemoryScope;
  requestedAt: string;
};

export type TaskQueueWriter = {
  enqueue(job: TaskExecutionJob): Promise<{ id?: string } | undefined>;
};

export type ClosableTaskQueueWriter = TaskQueueWriter & {
  close(): Promise<void>;
};

export function createRedisConnection(redisUrl: string) {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: Number(parsed.port || "6379"),
    db: Number(parsed.pathname.replace("/", "") || "0"),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export function createBullMqTaskQueue(
  redisUrl: string,
): ClosableTaskQueueWriter {
  const queue = new Queue<TaskExecutionJob>(TASK_QUEUE_NAME, {
    connection: createRedisConnection(redisUrl),
  });

  return {
    async enqueue(job) {
      const createdJob = await queue.add(job.kind, job);

      return {
        id: String(createdJob.id),
      };
    },
    async close() {
      await queue.close();
    },
  };
}
