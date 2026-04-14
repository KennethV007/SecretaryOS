import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { TaskRecord } from "@secretaryos/core";
import { createDefaultSettings, saveSettings } from "@secretaryos/settings";

import {
  CodexMcpExecutor,
  type RuntimeModelConfig,
  buildProviderConfigArgs,
  buildRuntimePrompt,
  createCodexMcpExecutor,
  hydrateCommandArgs,
  loadRuntimeModelConfig,
  parseCommandArgs,
  resolveLaneForTask,
} from "./index.js";

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task_1",
    sessionId: "session_1",
    type: "chat_assistant",
    status: "queued",
    approvalClass: 0,
    input: "Summarize the current project state.",
    mode: "assistant",
    title: "Summarize project state",
    ...overrides,
  };
}

test("resolveLaneForTask selects lane-specific models and reasoning", () => {
  const config: RuntimeModelConfig = {
    defaultProvider: "codex_mcp",
    defaultModel: "default-model",
    defaultReasoningEffort: "medium",
    assistantProvider: "codex_mcp",
    assistantModel: "assistant-model",
    assistantReasoningEffort: "low",
    plannerProvider: "codex_mcp",
    plannerModel: "planner-model",
    plannerReasoningEffort: "xhigh",
    afterHoursProvider: "codex_mcp",
    afterHoursModel: "after-hours-model",
    afterHoursReasoningEffort: "high",
    openRouterBaseUrl: "https://openrouter.ai/api/v1",
    maxParallelTasks: 3,
  };

  assert.equal(resolveLaneForTask(createTask(), config).provider, "codex_mcp");
  assert.equal(
    resolveLaneForTask(createTask(), config).model,
    "assistant-model",
  );
  assert.equal(resolveLaneForTask(createTask(), config).reasoningEffort, "low");
  assert.equal(
    resolveLaneForTask(createTask({ type: "planner_deep_dive" }), config).model,
    "planner-model",
  );
  assert.equal(
    resolveLaneForTask(createTask({ type: "after_hours_chat" }), config).model,
    "after-hours-model",
  );
});

test("loadRuntimeModelConfig prefers JSON settings over env lane defaults", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-runtime-settings-"));
  const settingsPath = join(rootDir, "settings.json");

  try {
    saveSettings(
      {
        ...createDefaultSettings(),
        models: {
          conversation: {
            provider: "openrouter",
            model: "openrouter/conversation-from-json",
            reasoningEffort: "low",
          },
          coding: {
            provider: "openrouter",
            model: "openrouter/coding-from-json",
            reasoningEffort: "high",
          },
          planner: {
            provider: "codex_mcp",
            model: "planner-from-json",
            reasoningEffort: "xhigh",
          },
          afterHours: {
            provider: "codex_mcp",
            model: "after-hours-from-json",
            reasoningEffort: "medium",
          },
        },
      },
      {
        filePath: settingsPath,
      },
    );

    const config = loadRuntimeModelConfig({
      SETTINGS_PATH: settingsPath,
      CODEX_DEFAULT_MODEL: "coding-from-env",
      CODEX_ASSISTANT_MODEL: "conversation-from-env",
      CODEX_PLANNER_MODEL: "planner-from-env",
      CODEX_AFTER_HOURS_MODEL: "after-hours-from-env",
      CODEX_MAX_PARALLEL_TASKS: "3",
    });

    assert.equal(config.defaultProvider, "openrouter");
    assert.equal(config.defaultModel, "openrouter/coding-from-json");
    assert.equal(config.defaultReasoningEffort, "high");
    assert.equal(config.assistantProvider, "openrouter");
    assert.equal(config.assistantModel, "openrouter/conversation-from-json");
    assert.equal(config.assistantReasoningEffort, "low");
    assert.equal(config.plannerProvider, "codex_mcp");
    assert.equal(config.plannerModel, "planner-from-json");
    assert.equal(config.plannerReasoningEffort, "xhigh");
    assert.equal(config.afterHoursProvider, "codex_mcp");
    assert.equal(config.afterHoursModel, "after-hours-from-json");
    assert.equal(config.afterHoursReasoningEffort, "medium");
    assert.equal(config.openRouterBaseUrl, "https://openrouter.ai/api/v1");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("buildRuntimePrompt includes task context", () => {
  const prompt = buildRuntimePrompt(
    createTask({
      projectId: "project_alpha",
      personaId: "secretary-default",
    }),
  );

  assert.match(prompt, /Task type: chat_assistant/);
  assert.match(prompt, /Persona: Secretary Default \(secretary-default\)/);
  assert.match(prompt, /Project: project_alpha/);
  assert.match(prompt, /Use the watered-down persona prompt/);
});

test("buildRuntimePrompt includes the unified skill registry", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-runtime-skills-"));
  const codexSkillDir = join(rootDir, ".codex", "skills", "repo-helper");

  try {
    mkdirSync(codexSkillDir, {
      recursive: true,
    });
    writeFileSync(
      join(codexSkillDir, "SKILL.md"),
      "# repo-helper\nRepository helper skill.\n",
      "utf8",
    );

    const prompt = buildRuntimePrompt(createTask(), {
      HOME: rootDir,
    });

    assert.match(prompt, /Available skills registry:/);
    assert.match(prompt, /filesystem\.list/);
    assert.match(prompt, /repo-helper/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("CodexMcpExecutor maps response output and usage", async () => {
  const executor = new CodexMcpExecutor(
    {
      async run() {
        return {
          outputText: "Execution complete.",
          inputTokens: 12,
          outputTokens: 7,
        };
      },
    },
    loadRuntimeModelConfig({
      CODEX_DEFAULT_MODEL: "default-model",
      CODEX_ASSISTANT_MODEL: "assistant-model",
      CODEX_PLANNER_MODEL: "planner-model",
      CODEX_AFTER_HOURS_MODEL: "after-hours-model",
      CODEX_MAX_PARALLEL_TASKS: "3",
    }),
  );

  const result = await executor.executeTask(createTask());

  assert.equal(result.status, "complete");
  assert.equal(result.outputText, "Execution complete.");
  assert.equal(result.usage?.inputTokens, 12);
});

test("createCodexMcpExecutor falls back to static execution without a codex command", async () => {
  const executor = createCodexMcpExecutor({
    CODEX_MCP_COMMAND: "",
  });

  const result = await executor.executeTask(createTask());

  assert.equal(result.status, "complete");
  assert.match(result.outputText, /Task chat_assistant executed/);
});

test("parseCommandArgs splits whitespace-delimited arguments", () => {
  assert.deepEqual(parseCommandArgs("--profile local --json"), [
    "--profile",
    "local",
    "--json",
  ]);
});

test("hydrateCommandArgs substitutes the model placeholder", () => {
  assert.deepEqual(
    hydrateCommandArgs(
      ["exec", "-m", "{model}", "--reasoning-effort", "{reasoning_effort}"],
      {
        model: "gpt-5.3-codex",
        reasoningEffort: "high",
      },
    ),
    ["exec", "-m", "gpt-5.3-codex", "--reasoning-effort", "high"],
  );
});

test("buildProviderConfigArgs configures OpenRouter through Codex overrides", () => {
  assert.deepEqual(
    buildProviderConfigArgs(
      {
        provider: "openrouter",
        reasoningEffort: "high",
      },
      {
        openRouterBaseUrl: "https://openrouter.ai/api/v1",
      },
    ),
    [
      "-c",
      'model_reasoning_effort="high"',
      "-c",
      'model_provider="openrouter"',
      "-c",
      'model_providers.openrouter.name="OpenRouter"',
      "-c",
      'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"',
      "-c",
      'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
      "-c",
      'model_providers.openrouter.wire_api="chat"',
    ],
  );
});
