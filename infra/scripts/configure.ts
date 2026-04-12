import "dotenv/config";

import { createReadStream, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import type { ReadStream, WriteStream } from "node:tty";
import { fileURLToPath } from "node:url";

import {
  CODEX_MODEL_CATALOG,
  DEFAULT_SETTINGS_PATH,
  REASONING_EFFORTS,
  ROUTE_PROVIDERS,
  type ReasoningEffort,
  type RouteProvider,
  type Settings,
  getSettingsSummary,
  loadSettings,
  saveSettings,
  validateSettingsEnvironment,
} from "@secretaryos/settings";

type ConfigureOptions = {
  env?: NodeJS.ProcessEnv;
  settingsPath?: string;
  nonInteractive?: boolean;
  forceInteractive?: boolean;
};

type InteractiveIo = {
  input: ReadStream;
  output: WriteStream;
  forced: boolean;
  close: () => void;
};

type SelectOption<T> = {
  label: string;
  value: T;
  description?: string;
};

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  white: "\x1b[37m",
} as const;

function colorize(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ANSI.reset}`;
}

async function promptText(
  rl: ReturnType<typeof createInterface>,
  label: string,
  fallback: string,
): Promise<string> {
  const response = await rl.question(`${label} [${fallback}]: `);
  return response.trim() || fallback;
}

function buildConfiguredSettings(
  current: Settings,
  values: {
    openRouterEnabled: boolean;
    openRouterBaseUrl: string;
    conversationProvider: RouteProvider;
    conversationModel: string;
    conversationReasoningEffort: ReasoningEffort;
    codingProvider: RouteProvider;
    codingModel: string;
    codingReasoningEffort: ReasoningEffort;
    plannerModel: string;
    plannerReasoningEffort: ReasoningEffort;
    afterHoursModel: string;
    afterHoursReasoningEffort: ReasoningEffort;
  },
): Settings {
  return {
    ...current,
    providers: {
      ...current.providers,
      codexMcp: {
        enabled: true,
      },
      openRouter: {
        enabled: values.openRouterEnabled,
        baseUrl: values.openRouterBaseUrl,
      },
    },
    models: {
      conversation: {
        provider: values.conversationProvider,
        model: values.conversationModel,
        reasoningEffort: values.conversationReasoningEffort,
      },
      coding: {
        provider: values.codingProvider,
        model: values.codingModel,
        reasoningEffort: values.codingReasoningEffort,
      },
      planner: {
        provider: values.codingProvider,
        model: values.plannerModel,
        reasoningEffort: values.plannerReasoningEffort,
      },
      afterHours: {
        provider: values.conversationProvider,
        model: values.afterHoursModel,
        reasoningEffort: values.afterHoursReasoningEffort,
      },
    },
  };
}

function printSettingsSummary(settings: Settings): void {
  console.log("[configure] saved settings:");

  for (const line of getSettingsSummary(settings)) {
    console.log(`[configure] ${line}`);
  }
}

function printNonInteractiveNotice(settingsPath: string): void {
  console.log(
    "[configure] interactive prompts were skipped because no TTY was detected.",
  );
  console.log(
    `[configure] existing settings were kept at ${settingsPath}. Run 'pnpm configure' in a normal terminal to edit them interactively.`,
  );
}

function openForcedInteractiveIo(): InteractiveIo {
  const input = createReadStream("/dev/tty") as ReadStream;
  const output = createWriteStream("/dev/tty") as WriteStream;

  return {
    input,
    output,
    forced: true,
    close() {
      input.destroy();
      output.end();
    },
  };
}

function tryOpenForcedInteractiveIo(): InteractiveIo | undefined {
  try {
    return openForcedInteractiveIo();
  } catch {
    return undefined;
  }
}

function supportsRawMode(input: ReadStream): boolean {
  return typeof input.setRawMode === "function";
}

function clearScreen(output: WriteStream): void {
  output.write("\x1b[2J\x1b[H");
}

async function selectOption<T>(
  io: InteractiveIo,
  title: string,
  options: Array<SelectOption<T>>,
  currentValue: T,
): Promise<T> {
  const initialIndex = Math.max(
    0,
    options.findIndex((option) => option.value === currentValue),
  );

  return new Promise<T>((resolve, reject) => {
    let index = initialIndex;
    const input = io.input;
    const output = io.output;

    const render = () => {
      clearScreen(output);
      output.write(
        `${colorize("SecretaryOS Configure", ANSI.bold, ANSI.cyan)}\n`,
      );
      output.write(`${colorize(title, ANSI.bold, ANSI.white)}\n`);
      output.write(
        `${colorize("Use ↑/↓ to move and Enter to select.", ANSI.dim)}\n\n`,
      );

      for (
        let optionIndex = 0;
        optionIndex < options.length;
        optionIndex += 1
      ) {
        const option = options[optionIndex];
        const selected = optionIndex === index;
        const prefix = selected
          ? colorize("›", ANSI.bold, ANSI.green)
          : colorize("•", ANSI.dim);
        const label = selected
          ? colorize(option.label, ANSI.bold, ANSI.green)
          : option.label;
        output.write(`${prefix} ${label}\n`);

        if (option.description) {
          output.write(`  ${colorize(option.description, ANSI.dim)}\n`);
        }
      }

      output.write(`\n${colorize("Press Ctrl+C to cancel.", ANSI.dim)}\n`);
    };

    const finish = (value: T) => {
      input.off("keypress", onKeypress);
      if (supportsRawMode(input)) {
        input.setRawMode(false);
      }
      clearScreen(output);
      resolve(value);
    };

    const fail = (error: Error) => {
      input.off("keypress", onKeypress);
      if (supportsRawMode(input)) {
        input.setRawMode(false);
      }
      clearScreen(output);
      reject(error);
    };

    const onKeypress = (
      _str: string,
      key: { name?: string; ctrl?: boolean },
    ) => {
      if (key.ctrl && key.name === "c") {
        fail(new Error("Configuration cancelled."));
        return;
      }

      if (key.name === "up") {
        index = index === 0 ? options.length - 1 : index - 1;
        render();
        return;
      }

      if (key.name === "down") {
        index = index === options.length - 1 ? 0 : index + 1;
        render();
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const selected = options[index];

        if (!selected) {
          fail(new Error("Invalid selection."));
          return;
        }

        finish(selected.value);
      }
    };

    emitKeypressEvents(input);

    if (supportsRawMode(input)) {
      input.setRawMode(true);
    }

    input.on("keypress", onKeypress);
    render();
  });
}

async function selectBoolean(
  io: InteractiveIo,
  title: string,
  currentValue: boolean,
): Promise<boolean> {
  return selectOption(
    io,
    title,
    [
      {
        label: "Yes",
        value: true,
      },
      {
        label: "No",
        value: false,
      },
    ],
    currentValue,
  );
}

async function selectProvider(
  io: InteractiveIo,
  title: string,
  currentValue: RouteProvider,
  availableProviders: RouteProvider[],
): Promise<RouteProvider> {
  return selectOption(
    io,
    title,
    availableProviders.map((provider) => ({
      label: provider,
      value: provider,
    })),
    currentValue,
  );
}

async function selectCodexModel(
  io: InteractiveIo,
  title: string,
  currentValue: string,
): Promise<string> {
  return selectOption(
    io,
    title,
    CODEX_MODEL_CATALOG.map((model) => ({
      label: model.label,
      value: model.id,
    })),
    currentValue,
  );
}

async function selectReasoningEffort(
  io: InteractiveIo,
  title: string,
  currentValue: ReasoningEffort,
  allowed: readonly ReasoningEffort[],
): Promise<ReasoningEffort> {
  return selectOption(
    io,
    title,
    allowed.map((effort) => ({
      label: effort,
      value: effort,
    })),
    currentValue,
  );
}

function getAllowedReasoningEfforts(
  modelId: string,
): readonly ReasoningEffort[] {
  return (
    CODEX_MODEL_CATALOG.find((model) => model.id === modelId)
      ?.reasoningEfforts ?? REASONING_EFFORTS
  );
}

function resolveInteractiveIo(
  options: ConfigureOptions,
): InteractiveIo | undefined {
  if (options.nonInteractive) {
    return undefined;
  }

  if (options.forceInteractive) {
    return openForcedInteractiveIo();
  }

  if (stdin.isTTY && stdout.isTTY) {
    return {
      input: stdin,
      output: stdout,
      forced: false,
      close() {},
    };
  }

  return tryOpenForcedInteractiveIo();
}

export async function runConfigureFlow(
  options: ConfigureOptions = {},
): Promise<Settings> {
  const env = options.env ?? process.env;
  const settingsPath =
    options.settingsPath ?? env.SETTINGS_PATH ?? DEFAULT_SETTINGS_PATH;
  const current = loadSettings({
    env,
    filePath: settingsPath,
    createIfMissing: true,
  });
  const interactiveIo = resolveInteractiveIo(options);

  if (!interactiveIo) {
    const saved = saveSettings(current, {
      filePath: settingsPath,
    });
    if (!options.nonInteractive) {
      printNonInteractiveNotice(settingsPath);
    }
    printSettingsSummary(saved);
    return saved;
  }

  const rl = createInterface({
    input: interactiveIo.input,
    output: interactiveIo.output,
  });

  try {
    console.log(
      `[configure] updating SecretaryOS settings${interactiveIo.forced ? " with forced interactive mode" : ""}`,
    );

    const openRouterEnabled = await selectBoolean(
      interactiveIo,
      "Enable OpenRouter as a selectable provider?",
      current.providers.openRouter.enabled,
    );
    const openRouterBaseUrl = await promptText(
      rl,
      "OpenRouter base URL",
      current.providers.openRouter.baseUrl,
    );
    const availableProviders = openRouterEnabled
      ? ROUTE_PROVIDERS
      : (["codex_mcp"] as RouteProvider[]);
    const conversationProvider = await selectProvider(
      interactiveIo,
      "Default provider for conversation",
      availableProviders.includes(current.models.conversation.provider)
        ? current.models.conversation.provider
        : "codex_mcp",
      availableProviders,
    );
    const conversationModel =
      conversationProvider === "codex_mcp"
        ? await selectCodexModel(
            interactiveIo,
            "Select the default conversation model",
            current.models.conversation.model,
          )
        : await promptText(
            rl,
            "Default conversation model",
            current.models.conversation.model,
          );
    const conversationReasoningEffort =
      conversationProvider === "codex_mcp"
        ? await selectReasoningEffort(
            interactiveIo,
            "Select the conversation reasoning effort",
            current.models.conversation.reasoningEffort,
            getAllowedReasoningEfforts(conversationModel),
          )
        : current.models.conversation.reasoningEffort;
    const codingProvider = await selectProvider(
      interactiveIo,
      "Default provider for coding",
      availableProviders.includes(current.models.coding.provider)
        ? current.models.coding.provider
        : "codex_mcp",
      availableProviders,
    );
    const codingModel =
      codingProvider === "codex_mcp"
        ? await selectCodexModel(
            interactiveIo,
            "Select the default coding model",
            current.models.coding.model,
          )
        : await promptText(
            rl,
            "Default coding model",
            current.models.coding.model,
          );
    const codingReasoningEffort =
      codingProvider === "codex_mcp"
        ? await selectReasoningEffort(
            interactiveIo,
            "Select the coding reasoning effort",
            current.models.coding.reasoningEffort,
            getAllowedReasoningEfforts(codingModel),
          )
        : current.models.coding.reasoningEffort;
    const plannerModel =
      codingProvider === "codex_mcp"
        ? await selectCodexModel(
            interactiveIo,
            "Select the planner model",
            current.models.planner.model,
          )
        : await promptText(
            rl,
            "Default planner model",
            current.models.planner.model,
          );
    const plannerReasoningEffort =
      codingProvider === "codex_mcp"
        ? await selectReasoningEffort(
            interactiveIo,
            "Select the planner reasoning effort",
            current.models.planner.reasoningEffort,
            getAllowedReasoningEfforts(plannerModel),
          )
        : current.models.planner.reasoningEffort;
    const afterHoursModel =
      conversationProvider === "codex_mcp"
        ? await selectCodexModel(
            interactiveIo,
            "Select the after-hours model",
            current.models.afterHours.model,
          )
        : await promptText(
            rl,
            "Default after-hours model",
            current.models.afterHours.model,
          );
    const afterHoursReasoningEffort =
      conversationProvider === "codex_mcp"
        ? await selectReasoningEffort(
            interactiveIo,
            "Select the after-hours reasoning effort",
            current.models.afterHours.reasoningEffort,
            getAllowedReasoningEfforts(afterHoursModel),
          )
        : current.models.afterHours.reasoningEffort;

    const saved = saveSettings(
      buildConfiguredSettings(current, {
        openRouterEnabled,
        openRouterBaseUrl,
        conversationProvider,
        conversationModel,
        conversationReasoningEffort,
        codingProvider,
        codingModel,
        codingReasoningEffort,
        plannerModel,
        plannerReasoningEffort,
        afterHoursModel,
        afterHoursReasoningEffort,
      }),
      {
        filePath: settingsPath,
      },
    );

    printSettingsSummary(saved);

    const issues = validateSettingsEnvironment(saved, env);

    for (const issue of issues) {
      console.warn(`[configure] warning: ${issue.message}`);
    }

    return saved;
  } finally {
    rl.close();
    interactiveIo.close();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  runConfigureFlow({
    nonInteractive:
      process.argv.includes("--yes") || process.argv.includes("--defaults"),
    forceInteractive: process.argv.includes("--interactive"),
  }).catch((error) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exitCode = 1;
  });
}
