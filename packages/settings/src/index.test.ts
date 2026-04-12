import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDefaultSettings,
  loadSettings,
  saveSettings,
  validateSettingsEnvironment,
} from "./index.js";

test("createDefaultSettings seeds lane models from env fallbacks", () => {
  const settings = createDefaultSettings({
    CODEX_DEFAULT_MODEL: "coding-model",
    CODEX_ASSISTANT_MODEL: "conversation-model",
    CODEX_PLANNER_MODEL: "planner-model",
    CODEX_AFTER_HOURS_MODEL: "after-hours-model",
  });

  assert.equal(settings.models.coding.model, "coding-model");
  assert.equal(settings.models.conversation.model, "conversation-model");
  assert.equal(settings.models.planner.model, "planner-model");
  assert.equal(settings.models.afterHours.model, "after-hours-model");
  assert.equal(settings.models.coding.reasoningEffort, "medium");
});

test("loadSettings returns defaults when the settings file is missing", () => {
  const settings = loadSettings({
    filePath: join(tmpdir(), "missing-settings.json"),
    env: {
      CODEX_DEFAULT_MODEL: "coding-model",
    },
  });

  assert.equal(settings.models.coding.model, "coding-model");
});

test("saveSettings and loadSettings round-trip settings to disk", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "secretary-settings-"));
  const filePath = join(rootDir, "settings.json");

  try {
    saveSettings(
      {
        ...createDefaultSettings(),
        providers: {
          codexMcp: { enabled: true },
          openRouter: {
            enabled: true,
            baseUrl: "https://openrouter.ai/api/v1",
          },
        },
        models: {
          conversation: {
            provider: "openrouter",
            model: "openrouter/conversation",
            reasoningEffort: "medium",
          },
          coding: {
            provider: "codex_mcp",
            model: "gpt-5.3-codex",
            reasoningEffort: "high",
          },
          planner: {
            provider: "codex_mcp",
            model: "gpt-5.3-codex",
            reasoningEffort: "medium",
          },
          afterHours: {
            provider: "codex_mcp",
            model: "gpt-5.3-codex",
            reasoningEffort: "low",
          },
        },
      },
      {
        filePath,
      },
    );

    const loaded = loadSettings({
      filePath,
    });

    assert.equal(loaded.models.conversation.provider, "openrouter");
    assert.equal(loaded.providers.openRouter.enabled, true);
    assert.equal(loaded.models.coding.reasoningEffort, "high");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("validateSettingsEnvironment flags missing provider secrets", () => {
  const settings = {
    ...createDefaultSettings(),
    providers: {
      codexMcp: { enabled: true },
      openRouter: {
        enabled: true,
        baseUrl: "https://openrouter.ai/api/v1",
      },
    },
    models: {
      conversation: {
        provider: "openrouter" as const,
        model: "openrouter/conversation",
        reasoningEffort: "medium" as const,
      },
      coding: {
        provider: "codex_mcp" as const,
        model: "gpt-5.3-codex",
        reasoningEffort: "medium" as const,
      },
      planner: {
        provider: "codex_mcp" as const,
        model: "gpt-5.3-codex",
        reasoningEffort: "medium" as const,
      },
      afterHours: {
        provider: "codex_mcp" as const,
        model: "gpt-5.3-codex",
        reasoningEffort: "medium" as const,
      },
    },
  };

  const issues = validateSettingsEnvironment(settings, {
    CODEX_MCP_COMMAND: "/opt/homebrew/bin/codex",
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0]?.message ?? "", /OPENROUTER_API_KEY/);
});
