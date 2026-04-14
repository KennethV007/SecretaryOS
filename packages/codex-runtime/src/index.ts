import { spawn } from "node:child_process";

import {
  DEFAULT_MODE,
  type ModelProvider,
  type ReasoningEffort,
  type TaskRecord,
  type TaskStatus,
  createId,
} from "@secretaryos/core";
import { resolvePersonaForMode } from "@secretaryos/personas";
import { buildPersonaPrompt } from "@secretaryos/prompts";
import { loadSettings } from "@secretaryos/settings";
import { listAvailableSkillsSync } from "@secretaryos/skills";

export type ExecutionRequest = {
  taskId: string;
  taskType: TaskRecord["type"];
  prompt: string;
  mode?: TaskRecord["mode"];
  personaId?: TaskRecord["personaId"];
};

export type ExecutionArtifact = {
  id: string;
  label: string;
  content: string;
  mimeType: string;
};

export type ExecutionUsage = {
  provider: ModelProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type ExecutionResult = {
  taskId: string;
  status: Extract<TaskStatus, "complete" | "failed">;
  outputText: string;
  summary: string;
  artifacts: ExecutionArtifact[];
  usage?: ExecutionUsage;
};

export interface TaskExecutor {
  executeTask(task: TaskRecord): Promise<ExecutionResult>;
}

export type RuntimeModelConfig = {
  defaultProvider: ModelProvider;
  defaultModel: string;
  defaultReasoningEffort: ReasoningEffort;
  assistantProvider: ModelProvider;
  assistantModel: string;
  assistantReasoningEffort: ReasoningEffort;
  plannerProvider: ModelProvider;
  plannerModel: string;
  plannerReasoningEffort: ReasoningEffort;
  afterHoursProvider: ModelProvider;
  afterHoursModel: string;
  afterHoursReasoningEffort: ReasoningEffort;
  openRouterBaseUrl: string;
  maxParallelTasks: number;
};

export type CodexCommandClient = {
  run: (request: {
    provider: ModelProvider;
    model: string;
    reasoningEffort: ReasoningEffort;
    prompt: string;
  }) => Promise<{
    outputText: string;
    inputTokens?: number;
    outputTokens?: number;
  }>;
};

export function buildExecutionRequest(task: TaskRecord): ExecutionRequest {
  return {
    taskId: task.id,
    taskType: task.type,
    prompt: task.input,
    mode: task.mode,
    personaId: task.personaId,
  };
}

function buildSkillRegistryPrompt(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const skills = listAvailableSkillsSync({
    env,
  });

  if (skills.length === 0) {
    return undefined;
  }

  return [
    "Available skills registry:",
    ...skills.map((skill) => {
      const source =
        skill.source === "secretaryos_builtin"
          ? "SecretaryOS"
          : skill.source === "codex_system"
            ? "Codex system"
            : "Codex installed";
      const approval =
        skill.approvalClass === null
          ? "policy n/a"
          : `approval class ${skill.approvalClass}`;

      return `- ${skill.id} [${source}; executor=${skill.executor}; ${approval}] ${skill.summary}`;
    }),
    "When the user asks what skills are available, answer from this registry using these exact skill ids.",
  ].join("\n");
}

export function buildRuntimePrompt(
  task: TaskRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const persona = resolvePersonaForMode(
    task.mode ?? DEFAULT_MODE,
    task.personaId,
  );
  const personaPrompt = buildPersonaPrompt(persona, task.mode ?? DEFAULT_MODE);
  const skillsPrompt = buildSkillRegistryPrompt(env);

  return [
    `Persona: ${persona.name} (${persona.slug})`,
    `Task type: ${task.type}`,
    `Mode: ${task.mode ?? "assistant"}`,
    `Approval class: ${task.approvalClass}`,
    task.projectId ? `Project: ${task.projectId}` : undefined,
    "Complete the task safely and concisely. Return the direct result.",
    "",
    personaPrompt,
    "",
    skillsPrompt,
    "",
    task.input,
  ]
    .filter(Boolean)
    .join("\n");
}

export function loadRuntimeModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeModelConfig {
  const settings = loadSettings({
    env,
  });

  return {
    defaultProvider: settings.models.coding.provider,
    defaultModel:
      settings.models.coding.model ?? env.CODEX_DEFAULT_MODEL ?? "gpt-5",
    defaultReasoningEffort: settings.models.coding.reasoningEffort ?? "medium",
    assistantProvider: settings.models.conversation.provider,
    assistantModel:
      settings.models.conversation.model ??
      env.CODEX_ASSISTANT_MODEL ??
      env.CODEX_DEFAULT_MODEL ??
      "gpt-5",
    assistantReasoningEffort:
      settings.models.conversation.reasoningEffort ?? "medium",
    plannerProvider: settings.models.planner.provider,
    plannerModel:
      settings.models.planner.model ??
      env.CODEX_PLANNER_MODEL ??
      env.CODEX_DEFAULT_MODEL ??
      "gpt-5",
    plannerReasoningEffort: settings.models.planner.reasoningEffort ?? "medium",
    afterHoursProvider: settings.models.afterHours.provider,
    afterHoursModel:
      settings.models.afterHours.model ??
      env.CODEX_AFTER_HOURS_MODEL ??
      env.CODEX_DEFAULT_MODEL ??
      "gpt-5",
    afterHoursReasoningEffort:
      settings.models.afterHours.reasoningEffort ?? "medium",
    openRouterBaseUrl:
      settings.providers.openRouter.baseUrl ??
      env.OPENROUTER_BASE_URL ??
      "https://openrouter.ai/api/v1",
    maxParallelTasks: Number(env.CODEX_MAX_PARALLEL_TASKS ?? "3"),
  };
}

export function resolveLaneForTask(
  task: TaskRecord,
  config: RuntimeModelConfig,
): {
  provider: ModelProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
} {
  if (task.type === "planner_deep_dive" || task.mode === "planner") {
    return {
      provider: config.plannerProvider,
      model: config.plannerModel,
      reasoningEffort: config.plannerReasoningEffort,
    };
  }

  if (task.type === "after_hours_chat" || task.mode === "after_hours") {
    return {
      provider: config.afterHoursProvider,
      model: config.afterHoursModel,
      reasoningEffort: config.afterHoursReasoningEffort,
    };
  }

  if (task.type === "chat_assistant") {
    return {
      provider: config.assistantProvider,
      model: config.assistantModel,
      reasoningEffort: config.assistantReasoningEffort,
    };
  }

  return {
    provider: config.defaultProvider,
    model: config.defaultModel,
    reasoningEffort: config.defaultReasoningEffort,
  };
}

export class CodexMcpExecutor implements TaskExecutor {
  constructor(
    private readonly client: CodexCommandClient,
    private readonly config: RuntimeModelConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async executeTask(task: TaskRecord): Promise<ExecutionResult> {
    const lane = resolveLaneForTask(task, this.config);
    const response = await this.client.run({
      provider: lane.provider,
      model: lane.model,
      reasoningEffort: lane.reasoningEffort,
      prompt: buildRuntimePrompt(task, this.env),
    });

    const outputText = response.outputText.trim();

    return {
      taskId: task.id,
      status: outputText ? "complete" : "failed",
      outputText,
      summary: outputText
        ? `Completed ${task.type} with model ${lane.model}.`
        : `Execution failed for ${task.type}.`,
      artifacts: outputText
        ? [
            {
              id: createId("artifact"),
              label: "response.txt",
              content: outputText,
              mimeType: "text/plain",
            },
          ]
        : [],
      usage: {
        provider: lane.provider,
        model: lane.model,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
      },
    };
  }
}

export function parseCommandArgs(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function hydrateCommandArgs(
  args: string[],
  request: { model: string; reasoningEffort: ReasoningEffort },
): string[] {
  return args.map((arg) => {
    if (arg === "{model}") {
      return request.model;
    }

    if (arg === "{reasoning_effort}") {
      return request.reasoningEffort;
    }

    return arg;
  });
}

function toTomlString(value: string): string {
  return JSON.stringify(value);
}

export function buildProviderConfigArgs(
  request: {
    provider: ModelProvider;
    reasoningEffort: ReasoningEffort;
  },
  config: Pick<RuntimeModelConfig, "openRouterBaseUrl">,
): string[] {
  const args = [
    "-c",
    `model_reasoning_effort=${toTomlString(request.reasoningEffort)}`,
  ];

  if (request.provider !== "openrouter") {
    return args;
  }

  return [
    ...args,
    "-c",
    'model_provider="openrouter"',
    "-c",
    'model_providers.openrouter.name="OpenRouter"',
    "-c",
    `model_providers.openrouter.base_url=${toTomlString(config.openRouterBaseUrl)}`,
    "-c",
    'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
    "-c",
    'model_providers.openrouter.wire_api="chat"',
  ];
}

export function createCodexCommandClient(
  env: NodeJS.ProcessEnv = process.env,
): CodexCommandClient | undefined {
  const command = env.CODEX_MCP_COMMAND || env.CODEX_COMMAND;

  if (!command) {
    return undefined;
  }

  const baseArgs = parseCommandArgs(env.CODEX_MCP_ARGS || env.CODEX_ARGS);
  const runtimeConfig = loadRuntimeModelConfig(env);

  return {
    async run(request) {
      const resolvedArgs = [
        ...hydrateCommandArgs(baseArgs, {
          model: request.model,
          reasoningEffort: request.reasoningEffort,
        }),
        ...buildProviderConfigArgs(request, runtimeConfig),
      ];
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(command, resolvedArgs, {
          env: {
            ...process.env,
            ...env,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.stderr.on("data", (chunk: Buffer | string) => {
          errorOutput += chunk.toString();
        });

        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve(output);
            return;
          }

          reject(
            new Error(
              `Codex MCP command failed with exit code ${code}: ${errorOutput.trim()}`,
            ),
          );
        });

        child.stdin.write(request.prompt);
        child.stdin.end();
      });

      return {
        outputText: stdout.trim(),
        inputTokens: Math.max(1, Math.ceil(request.prompt.length / 4)),
        outputTokens: Math.max(1, Math.ceil(stdout.trim().length / 4)),
      };
    },
  };
}

export function createCodexMcpExecutor(
  env: NodeJS.ProcessEnv = process.env,
): TaskExecutor {
  const client = createCodexCommandClient(env);

  if (!client) {
    return createStaticExecutor();
  }

  return new CodexMcpExecutor(client, loadRuntimeModelConfig(env));
}

export function createStaticExecutor(): TaskExecutor {
  return {
    async executeTask(task) {
      return {
        taskId: task.id,
        status: "complete",
        outputText: `Task ${task.type} executed for session ${task.sessionId}.`,
        summary: `Completed ${task.type}.`,
        artifacts: [
          {
            id: createId("artifact"),
            label: "result.txt",
            content: task.input,
            mimeType: "text/plain",
          },
        ],
        usage: {
          provider: "system",
          model: "static-executor",
          inputTokens: Math.max(1, Math.ceil(task.input.length / 4)),
          outputTokens: 32,
        },
      };
    },
  };
}
