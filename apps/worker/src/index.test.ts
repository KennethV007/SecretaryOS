import assert from "node:assert/strict";
import test from "node:test";

import { createStaticExecutor } from "@secretaryos/codex-runtime";
import { type TaskRecord, createId } from "@secretaryos/core";
import type { TaskExecutionJob } from "@secretaryos/events";

import { type WorkerDependencies, processTaskExecutionJob } from "./index.js";
import { InMemoryTaskQueue } from "./queue.js";

function createTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: createId("task"),
    sessionId: createId("session"),
    type: "chat_assistant",
    status: "queued",
    approvalClass: 0,
    input: "Summarize the latest status update.",
    mode: "assistant",
    title: "Summarize status update",
    ...overrides,
  };
}

test("processTaskExecutionJob completes a runnable task and requests memory write", async () => {
  const task = createTaskRecord();
  const updates: TaskRecord[] = [];
  const memoryWrites: string[] = [];

  const result = await processTaskExecutionJob(
    {
      kind: "task.execute",
      task,
      requestedAt: new Date().toISOString(),
    },
    {
      executor: createStaticExecutor(),
      onTaskUpdated(taskUpdate) {
        updates.push(taskUpdate);
      },
      onMemoryWriteRequested(job) {
        memoryWrites.push(job.content);
      },
    },
  );

  assert.equal(result.task.status, "complete");
  assert.equal(updates.at(0)?.status, "running");
  assert.equal(updates.at(-1)?.status, "complete");
  assert.equal(memoryWrites.length, 1);
});

test("processTaskExecutionJob leaves approval-gated tasks paused", async () => {
  const task = createTaskRecord({
    status: "awaiting_approval",
    approvalClass: 2,
    type: "filesystem_reorg",
  });
  const events: string[] = [];

  const result = await processTaskExecutionJob(
    {
      kind: "task.execute",
      task,
      requestedAt: new Date().toISOString(),
    },
    {
      executor: createStaticExecutor(),
      onEvent(event) {
        events.push(event.name);
      },
    },
  );

  assert.equal(result.task.status, "awaiting_approval");
  assert.deepEqual(events, ["task.awaiting_approval"]);
});

test("processTaskExecutionJob executes markdown runbooks deterministically", async () => {
  const task = createTaskRecord({
    type: "markdown_runbook_execute",
    input: "- [mode.switch] planner",
  });

  const result = await processTaskExecutionJob(
    {
      kind: "task.execute",
      task,
      requestedAt: new Date().toISOString(),
    },
    {
      executor: createStaticExecutor(),
    },
  );

  assert.equal(result.task.status, "complete");
  assert.match(result.outputText ?? "", /Step 1/);
  assert.match(result.summary ?? "", /Executed 1 runbook step/);
  assert.equal(result.usage?.model, "markdown-runbook");
});

test("InMemoryTaskQueue drains queued jobs through the worker processor", async () => {
  const queue = new InMemoryTaskQueue();
  const outputs: string[] = [];
  const dependencies: WorkerDependencies = {
    executor: createStaticExecutor(),
    onTaskUpdated(task) {
      if (task.status === "complete") {
        outputs.push(task.id);
      }
    },
  };

  await queue.enqueue({
    kind: "task.execute",
    task: createTaskRecord(),
    requestedAt: new Date().toISOString(),
  } satisfies TaskExecutionJob);

  const results = await queue.drain(dependencies);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.task.status, "complete");
  assert.equal(outputs.length, 1);
});
