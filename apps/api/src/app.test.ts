import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { TaskExecutionJob } from "@secretaryos/events";
import {
  SecretaryOrchestrator,
  createInMemoryRuntimeState,
} from "@secretaryos/orchestrator";
import { getManagedCodexPackInstallPath } from "@secretaryos/skills";

import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config.js";

const testEnv = {
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/secretary_os",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "super-secret-value",
  INTERNAL_API_KEY: "internal-api-key",
};

class TestTaskQueue {
  readonly jobs: TaskExecutionJob[] = [];

  async enqueue(job: TaskExecutionJob) {
    this.jobs.push(job);

    return {
      id: job.task.id,
    };
  }
}

function completeQueuedTask(
  runtime: SecretaryOrchestrator,
  job: TaskExecutionJob,
) {
  const runningTask = {
    ...job.task,
    status: "running" as const,
  };
  const outputText = `Task ${job.task.type} executed for session ${job.task.sessionId}.`;
  const completedTask = {
    ...runningTask,
    status: "complete" as const,
    summary: `Completed ${job.task.type}.`,
    outputText,
  };

  runtime.recordTaskUpdate(runningTask);
  runtime.recordTaskUpdate(completedTask);
  runtime.recordTaskCompletion({
    task: completedTask,
    outputText,
    usage: {
      provider: "system",
      model: "static-executor",
      inputTokens: Math.max(1, Math.ceil(job.task.input.length / 4)),
      outputTokens: 32,
    },
  });
  runtime.recordMemoryWrite({
    kind: "memory.write",
    taskId: completedTask.id,
    content: outputText,
    scope: completedTask.mode === "after_hours" ? "after_hours_only" : "global",
    requestedAt: new Date().toISOString(),
  });
}

test("loadApiConfig rejects missing required env", () => {
  assert.throws(() => loadApiConfig({}), /Invalid API environment/);
});

test("health route returns service status", async () => {
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "ok");

  await app.close();
});

test("session creation and persona update routes work", async () => {
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
  });

  const sessionResponse = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: {
      channel: "dashboard",
      channelSessionKey: "session-key",
    },
  });

  assert.equal(sessionResponse.statusCode, 201);
  const session = sessionResponse.json();

  const personaResponse = await app.inject({
    method: "PATCH",
    url: `/sessions/${session.id}`,
    payload: {
      mode: "after_hours",
    },
  });

  assert.equal(personaResponse.statusCode, 200);

  const setPersonaResponse = await app.inject({
    method: "POST",
    url: "/personas/active",
    payload: {
      sessionId: session.id,
      personaId: "after-hours-companion",
    },
  });

  assert.equal(setPersonaResponse.statusCode, 200);
  assert.equal(
    setPersonaResponse.json().activePersonaId,
    "after-hours-companion",
  );

  await app.close();
});

test("global active persona route persists the selected character", async () => {
  const personaPackRoot = mkdtempSync(join(tmpdir(), "secretary-persona-api-"));
  const activeCharacterPath = join(personaPackRoot, "active-character.json");
  const runtime = new SecretaryOrchestrator(
    createInMemoryRuntimeState({
      personaPackRoot,
      activePersonaStorePath: activeCharacterPath,
    }),
  );

  runtime.createPersona({
    slug: "night-operator",
    name: "Night Operator",
    description: "Calm late-night persona.",
    basePrompt: "Use a calm, concise, grounded tone.",
    fullPrompt: "Use a calm, immersive, fully conversational tone.",
    definitionMarkdown: "# Night Operator\n\nCalm late-night persona.",
    traits: ["calm", "grounded"],
    formattingPreferences: ["concise"],
    memoryScopePolicy: "global",
    enabled: true,
  });

  const app = buildApiApp({
    config: loadApiConfig({
      ...testEnv,
      PERSONA_PACK_ROOT: personaPackRoot,
      ACTIVE_CHARACTER_PATH: activeCharacterPath,
    }),
    runtime,
  });

  const listResponse = await app.inject({
    method: "GET",
    url: "/personas",
  });
  const nightOperator = listResponse
    .json()
    .items.find(
      (persona: { slug: string }) => persona.slug === "night-operator",
    );

  const setResponse = await app.inject({
    method: "POST",
    url: "/personas/global-active",
    payload: {
      personaId: nightOperator.id,
    },
  });

  assert.equal(setResponse.statusCode, 200);
  assert.equal(setResponse.json().slug, "night-operator");
  assert.equal(existsSync(activeCharacterPath), true);
  assert.equal(
    JSON.parse(readFileSync(activeCharacterPath, "utf8")).personaId,
    nightOperator.id,
  );

  const getResponse = await app.inject({
    method: "GET",
    url: "/personas/global-active",
  });

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.json().slug, "night-operator");

  await app.close();
});

test("skills and session message routes are exposed", async () => {
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
  });

  const skillsResponse = await app.inject({
    method: "GET",
    url: "/skills",
  });
  assert.equal(skillsResponse.statusCode, 200);
  assert.ok(Array.isArray(skillsResponse.json().items));

  const sessionResponse = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: {
      channel: "dashboard",
      channelSessionKey: "messages-route",
    },
  });

  const session = sessionResponse.json();
  const messagesResponse = await app.inject({
    method: "GET",
    url: `/sessions/${session.id}/messages`,
  });

  assert.equal(messagesResponse.statusCode, 200);
  assert.ok(Array.isArray(messagesResponse.json().items));

  await app.close();
});

test("memory route supports kind, scope, and source filters", async () => {
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState());
  const session = runtime.createSession({
    channel: "dashboard",
    channelSessionKey: "memory-filter-route",
    userName: "Local User",
  });
  const task = await runtime.createTask({
    sessionId: session.id,
    channel: "dashboard",
    content: "Remember my preference for terse replies.",
  });

  runtime.recordMemoryWrite({
    kind: "memory.write",
    taskId: task.task.id,
    content: "Remember my preference for terse replies.",
    memoryKind: "preference",
    scope: "global",
    requestedAt: new Date().toISOString(),
  });
  runtime.recordMemoryWrite({
    kind: "memory.write",
    taskId: task.task.id,
    content: "Project note: use pnpm in this repository.",
    memoryKind: "project",
    scope: "project",
    requestedAt: new Date().toISOString(),
  });

  const app = buildApiApp({
    config: loadApiConfig(testEnv),
    runtime,
  });

  const preferenceResponse = await app.inject({
    method: "GET",
    url: "/memory?kind=preference&scope=global&source=codex_task",
  });

  assert.equal(preferenceResponse.statusCode, 200);
  assert.equal(preferenceResponse.json().items.length, 1);
  assert.equal(preferenceResponse.json().items[0]?.kind, "preference");

  const projectResponse = await app.inject({
    method: "GET",
    url: "/memory?kind=project&scope=project",
  });

  assert.equal(projectResponse.statusCode, 200);
  assert.equal(projectResponse.json().items.length, 1);
  assert.equal(projectResponse.json().items[0]?.kind, "project");

  await app.close();
});

test("skill import routes install packs into the live Codex skill root", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "secretary-skill-api-"));
  const skillPackRoot = join(workspace, "skill-packs");
  const codexSkillRoot = join(workspace, ".codex", "skills");
  const sourceDir = join(workspace, "source-pack");

  mkdirSync(join(sourceDir, "repo-helper"), {
    recursive: true,
  });
  writeFileSync(
    join(sourceDir, "skill-pack.json"),
    JSON.stringify(
      {
        id: "workspace-pack",
        name: "Workspace Pack",
        skills: [
          {
            id: "repo-helper",
            summary: "Repository helper.",
            approvalClass: 0,
          },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(sourceDir, "repo-helper", "SKILL.md"),
    "# repo-helper\nRepository helper.\n",
  );

  const app = buildApiApp({
    config: loadApiConfig({
      ...testEnv,
      SKILL_PACK_ROOT: skillPackRoot,
      CODEX_SKILL_ROOT: codexSkillRoot,
    }),
  });

  const importResponse = await app.inject({
    method: "POST",
    url: "/skills/import",
    payload: {
      sourceDir,
    },
  });

  assert.equal(importResponse.statusCode, 201);
  assert.equal(importResponse.json().installed, true);
  assert.deepEqual(importResponse.json().liveSkillIds, ["repo-helper"]);
  assert.equal(
    importResponse.json().installedPath,
    getManagedCodexPackInstallPath("workspace-pack", codexSkillRoot),
  );

  const packsResponse = await app.inject({
    method: "GET",
    url: "/skills/packs",
  });

  assert.equal(packsResponse.statusCode, 200);
  assert.equal(packsResponse.json().items[0]?.installed, true);
  assert.deepEqual(packsResponse.json().items[0]?.liveSkillIds, [
    "repo-helper",
  ]);

  const skillsResponse = await app.inject({
    method: "GET",
    url: "/skills",
  });

  assert.equal(skillsResponse.statusCode, 200);
  assert.ok(
    skillsResponse
      .json()
      .items.some((skill: { id: string }) => skill.id === "repo-helper"),
  );

  await app.close();
  rmSync(workspace, {
    recursive: true,
    force: true,
  });
});

test("persona creation route writes a persona pack into the configured root", async () => {
  const personaPackRoot = mkdtempSync(join(tmpdir(), "secretary-persona-api-"));
  const runtime = new SecretaryOrchestrator(
    createInMemoryRuntimeState({ personaPackRoot }),
  );
  const app = buildApiApp({
    config: loadApiConfig({
      ...testEnv,
      PERSONA_PACK_ROOT: personaPackRoot,
    }),
    runtime,
  });

  const response = await app.inject({
    method: "POST",
    url: "/personas",
    payload: {
      slug: "night-operator",
      name: "Night Operator",
      description: "Calm late-night persona.",
      basePrompt: "Use a calm, concise, grounded tone.",
      fullPrompt: "Use a calm, immersive, fully conversational tone.",
      definitionMarkdown: "# Night Operator\n\nCalm late-night persona.",
      traits: ["calm", "grounded"],
      formattingPreferences: ["concise"],
      memoryScopePolicy: "after_hours_only",
      enabled: true,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().slug, "night-operator");

  const listResponse = await app.inject({
    method: "GET",
    url: "/personas",
  });

  assert.equal(listResponse.statusCode, 200);
  assert.ok(
    listResponse
      .json()
      .items.some(
        (persona: { slug: string }) => persona.slug === "night-operator",
      ),
  );

  await app.close();
});

test("approval flow transitions a gated task back to queued", async () => {
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
  });

  const sessionResponse = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: {
      channel: "dashboard",
      channelSessionKey: "approval-key",
    },
  });
  const session = sessionResponse.json();

  const taskResponse = await app.inject({
    method: "POST",
    url: "/tasks",
    payload: {
      sessionId: session.id,
      channel: "dashboard",
      content: "Reorganize the workspace files",
      taskType: "filesystem_reorg",
    },
  });

  assert.equal(taskResponse.statusCode, 201);
  const taskPayload = taskResponse.json();
  assert.equal(taskPayload.task.status, "awaiting_approval");

  const approvalsResponse = await app.inject({
    method: "GET",
    url: "/approvals?status=pending",
  });
  const approval = approvalsResponse.json().items[0];

  const resolveResponse = await app.inject({
    method: "POST",
    url: `/approvals/${approval.id}/resolve`,
    payload: {
      status: "approved",
    },
  });

  assert.equal(resolveResponse.statusCode, 200);

  const taskAfterResponse = await app.inject({
    method: "GET",
    url: `/tasks/${taskPayload.task.id}`,
  });

  assert.equal(taskAfterResponse.statusCode, 200);
  assert.equal(taskAfterResponse.json().status, "queued");

  await app.close();
});

test("message intake can round-trip through the worker and surface usage and memory", async () => {
  const queue = new TestTaskQueue();
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState(), {
    taskQueue: queue,
  });
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
    runtime,
  });

  const messageResponse = await app.inject({
    method: "POST",
    url: "/messages",
    payload: {
      channel: "discord",
      channelSessionKey: "discord-thread-1",
      content: "Summarize the latest repository update.",
    },
  });

  assert.equal(messageResponse.statusCode, 201);
  const payload = messageResponse.json();
  assert.equal(payload.enqueued, true);
  assert.equal(queue.jobs.length, 1);

  const job = queue.jobs.shift();
  assert.ok(job);

  completeQueuedTask(runtime, job);

  const taskResponse = await app.inject({
    method: "GET",
    url: `/tasks/${payload.task.id}`,
  });
  assert.equal(taskResponse.statusCode, 200);
  assert.equal(taskResponse.json().status, "complete");
  assert.match(taskResponse.json().outputText, /Task chat_assistant executed/);

  const usageResponse = await app.inject({
    method: "GET",
    url: "/usage/summary?window=today",
  });
  assert.equal(usageResponse.statusCode, 200);
  assert.equal(usageResponse.json().requestCount, 1);

  const memoryResponse = await app.inject({
    method: "GET",
    url: "/memory",
  });
  assert.equal(memoryResponse.statusCode, 200);
  assert.equal(memoryResponse.json().items.length, 1);

  const sessionsResponse = await app.inject({
    method: "GET",
    url: "/sessions",
  });
  assert.equal(sessionsResponse.statusCode, 200);
  assert.equal(sessionsResponse.json().items.length, 1);

  await app.close();
});

test("internal routes reject requests without the internal API key", async () => {
  const app = buildApiApp({
    config: loadApiConfig(testEnv),
  });

  const response = await app.inject({
    method: "POST",
    url: "/internal/tasks/update",
    payload: {
      task: {
        id: "task_1",
        sessionId: "session_1",
        type: "chat_assistant",
        status: "queued",
        approvalClass: 0,
        input: "Hello",
      },
    },
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test("self-improvement routes expose replay and candidate data", async () => {
  const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState());
  runtime.createImprovementCandidate({
    type: "prompt",
    title: "Tighten planner prompt",
    description: "Reduce verbosity in planner mode.",
    targetSurface: "planner_mode",
    proposedBy: "critic",
  });

  const app = buildApiApp({
    config: loadApiConfig(testEnv),
    runtime,
  });

  const replayResponse = await app.inject({
    method: "GET",
    url: "/replays",
  });

  assert.equal(replayResponse.statusCode, 200);

  const candidateResponse = await app.inject({
    method: "GET",
    url: "/improvement/candidates",
  });

  assert.equal(candidateResponse.statusCode, 200);
  assert.equal(candidateResponse.json().items.length, 1);

  const promptResponse = await app.inject({
    method: "POST",
    url: "/prompt-versions",
    payload: {
      scope: "planner_mode",
      name: "planner-v1",
      content: "Stay concise.",
      version: 1,
      active: true,
    },
  });

  assert.equal(promptResponse.statusCode, 201);

  await app.close();
});
