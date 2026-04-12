import { Worker } from "bullmq";

import {
  TASK_QUEUE_NAME,
  type TaskExecutionJob,
  createRedisConnection,
  createBullMqTaskQueue as createSharedBullMqTaskQueue,
} from "@secretaryos/events";

import {
  type TaskExecutionOutcome,
  type WorkerDependencies,
  processTaskExecutionJob,
} from "./index.js";

export function createBullMqTaskQueue(redisUrl: string) {
  return createSharedBullMqTaskQueue(redisUrl);
}

export function createBullMqTaskWorker(
  redisUrl: string,
  dependencies: WorkerDependencies,
  options: {
    concurrency?: number;
  } = {},
) {
  const connection = createRedisConnection(redisUrl);
  const worker = new Worker<TaskExecutionJob>(
    TASK_QUEUE_NAME,
    async (job) => processTaskExecutionJob(job.data, dependencies),
    {
      connection,
      concurrency: options.concurrency ?? 1,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] completed job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[worker] failed job ${job?.id ?? "unknown"}: ${error.message}`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[worker] queue error: ${error.message}`);
  });

  return {
    worker,
    async close() {
      await worker.close();
    },
  };
}

export class InMemoryTaskQueue {
  readonly jobs: TaskExecutionJob[] = [];

  async enqueue(job: TaskExecutionJob) {
    this.jobs.push(job);

    return {
      id: job.task.id,
    };
  }

  async drain(
    dependencies: WorkerDependencies,
  ): Promise<TaskExecutionOutcome[]> {
    const jobs = [...this.jobs];
    this.jobs.length = 0;

    const results: TaskExecutionOutcome[] = [];

    for (const job of jobs) {
      results.push(await processTaskExecutionJob(job, dependencies));
    }

    return results;
  }
}
