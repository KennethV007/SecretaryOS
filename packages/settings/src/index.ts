import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");

export const DEFAULT_SETTINGS_PATH = resolve(
  REPO_ROOT,
  "config",
  "settings.json",
);
export const DEFAULT_SETTINGS_EXAMPLE_PATH = resolve(
  REPO_ROOT,
  "config",
  "settings.example.json",
);
export const ROUTE_PROVIDERS = ["codex_mcp", "openrouter"] as const;
export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export const CODEX_MODEL_CATALOG = [
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    reasoningEfforts: REASONING_EFFORTS,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    reasoningEfforts: REASONING_EFFORTS,
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    reasoningEfforts: REASONING_EFFORTS,
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    reasoningEfforts: REASONING_EFFORTS,
  },
] as const;

export const RouteProviderSchema = z.enum(ROUTE_PROVIDERS);
export const ReasoningEffortSchema = z.enum(REASONING_EFFORTS);
export const LaneSettingsSchema = z.object({
  provider: RouteProviderSchema,
  model: z.string().min(1),
  reasoningEffort: ReasoningEffortSchema,
});
export const OpenRouterSettingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url(),
});
export const SettingsSchema = z.object({
  version: z.literal(1),
  providers: z.object({
    codexMcp: z.object({
      enabled: z.boolean(),
    }),
    openRouter: OpenRouterSettingsSchema,
  }),
  models: z.object({
    conversation: LaneSettingsSchema,
    coding: LaneSettingsSchema,
    planner: LaneSettingsSchema,
    afterHours: LaneSettingsSchema,
  }),
});

export type RouteProvider = z.infer<typeof RouteProviderSchema>;
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type LaneSettings = z.infer<typeof LaneSettingsSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type SettingsOptions = {
  filePath?: string;
  env?: NodeJS.ProcessEnv;
  createIfMissing?: boolean;
};

export type SettingsValidationIssue = {
  path: string;
  message: string;
};

function resolveSettingsPath(
  candidate: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  const rawPath = candidate ?? env.SETTINGS_PATH ?? DEFAULT_SETTINGS_PATH;

  if (rawPath.startsWith("/")) {
    return resolve(rawPath);
  }

  return resolve(REPO_ROOT, rawPath);
}

function ensureParentDir(filePath: string): string {
  const normalized = resolve(filePath);
  const parent = dirname(normalized);

  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }

  return normalized;
}

export function createDefaultSettings(
  env: NodeJS.ProcessEnv = process.env,
): Settings {
  const codingModel = env.CODEX_DEFAULT_MODEL ?? "gpt-5.3-codex";
  const conversationModel =
    env.CODEX_ASSISTANT_MODEL ??
    env.CODEX_DEFAULT_MODEL ??
    "gpt-5.3-codex-spark";
  const plannerModel = env.CODEX_PLANNER_MODEL ?? codingModel;
  const afterHoursModel = env.CODEX_AFTER_HOURS_MODEL ?? codingModel;

  return {
    version: 1,
    providers: {
      codexMcp: {
        enabled: true,
      },
      openRouter: {
        enabled: false,
        baseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      },
    },
    models: {
      conversation: {
        provider: "codex_mcp",
        model: conversationModel,
        reasoningEffort: "medium",
      },
      coding: {
        provider: "codex_mcp",
        model: codingModel,
        reasoningEffort: "medium",
      },
      planner: {
        provider: "codex_mcp",
        model: plannerModel,
        reasoningEffort: "medium",
      },
      afterHours: {
        provider: "codex_mcp",
        model: afterHoursModel,
        reasoningEffort: "medium",
      },
    },
  };
}

function mergeSettings(
  defaults: Settings,
  raw: Partial<Settings> | undefined,
): Settings {
  return SettingsSchema.parse({
    ...defaults,
    ...raw,
    providers: {
      ...defaults.providers,
      ...raw?.providers,
      codexMcp: {
        ...defaults.providers.codexMcp,
        ...raw?.providers?.codexMcp,
      },
      openRouter: {
        ...defaults.providers.openRouter,
        ...raw?.providers?.openRouter,
      },
    },
    models: {
      ...defaults.models,
      ...raw?.models,
      conversation: {
        ...defaults.models.conversation,
        ...raw?.models?.conversation,
      },
      coding: {
        ...defaults.models.coding,
        ...raw?.models?.coding,
      },
      planner: {
        ...defaults.models.planner,
        ...raw?.models?.planner,
      },
      afterHours: {
        ...defaults.models.afterHours,
        ...raw?.models?.afterHours,
      },
    },
  });
}

export function loadSettings(options: SettingsOptions = {}): Settings {
  const env = options.env ?? process.env;
  const defaults = createDefaultSettings(env);
  const filePath = resolveSettingsPath(options.filePath, env);

  if (!existsSync(filePath)) {
    if (options.createIfMissing) {
      saveSettings(defaults, {
        filePath,
      });
    }

    return defaults;
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<Settings>;

  return mergeSettings(defaults, raw);
}

export function saveSettings(
  settings: Settings,
  options: Pick<SettingsOptions, "filePath"> = {},
): Settings {
  const filePath = ensureParentDir(
    resolveSettingsPath(options.filePath, process.env),
  );
  const normalized = SettingsSchema.parse(settings);

  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}

export function validateSettingsEnvironment(
  settings: Settings,
  env: NodeJS.ProcessEnv = process.env,
): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  const usesOpenRouter =
    settings.providers.openRouter.enabled ||
    Object.values(settings.models).some(
      (lane) => lane.provider === "openrouter",
    );

  if (usesOpenRouter && !env.OPENROUTER_API_KEY) {
    issues.push({
      path: "OPENROUTER_API_KEY",
      message:
        "OpenRouter is enabled in settings, but OPENROUTER_API_KEY is missing from .env.",
    });
  }

  if (
    Object.values(settings.models).some(
      (lane) => lane.provider === "codex_mcp",
    ) &&
    !env.CODEX_MCP_COMMAND
  ) {
    issues.push({
      path: "CODEX_MCP_COMMAND",
      message:
        "At least one lane uses codex_mcp, but CODEX_MCP_COMMAND is missing from .env.",
    });
  }

  return issues;
}

export function getSettingsSummary(settings: Settings): string[] {
  return [
    `Conversation: ${settings.models.conversation.provider} / ${settings.models.conversation.model} / ${settings.models.conversation.reasoningEffort}`,
    `Coding: ${settings.models.coding.provider} / ${settings.models.coding.model} / ${settings.models.coding.reasoningEffort}`,
    `Planner: ${settings.models.planner.provider} / ${settings.models.planner.model} / ${settings.models.planner.reasoningEffort}`,
    `After Hours: ${settings.models.afterHours.provider} / ${settings.models.afterHours.model} / ${settings.models.afterHours.reasoningEffort}`,
    `OpenRouter enabled: ${settings.providers.openRouter.enabled ? "yes" : "no"}`,
  ];
}
