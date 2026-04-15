import { type ZodIssue, z } from "zod";

const ChildEnvSchema = z.object({
  CHILD_DISCORD_BOT_TOKEN: z.string().min(1),
  CHILD_DISCORD_CLIENT_ID: z.string().min(1),
  CHILD_DISCORD_GUILD_ID: z.string().min(1).optional(),
  CHILD_DISCORD_CHANNEL_ID: z.string().min(1),
  CHILD_DISCORD_ALLOWED_USER_IDS: z.string().optional(),
  CHILD_NAME: z.string().min(1).default("Pip"),
  CHILD_AGE: z.coerce.number().int().min(1).max(17).default(9),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  CHILD_MEMORY_DIR: z.string().min(1).default("./data/child-memory"),
  CHILD_CONVERSATION_MAX_TURNS: z.coerce.number().int().positive().default(40),
  CHILD_FACTS_MAX: z.coerce.number().int().positive().default(100),
  CHILD_PROACTIVE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  CHILD_PROACTIVE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600000),
  CHILD_BEDTIME_HOUR: z.coerce.number().int().min(0).max(23).default(21),
  CHILD_WAKEUP_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  CHILD_PROACTIVE_USE_OLLAMA: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type ChildConfig = {
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
    channelId: string;
    allowedUserIds: string[];
  };
  persona: {
    name: string;
    age: number;
  };
  ollama: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
  };
  memory: {
    dir: string;
    conversationMaxTurns: number;
    factsMax: number;
  };
  proactive: {
    enabled: boolean;
    intervalMs: number;
    bedtimeHour: number;
    wakeupHour: number;
    useOllama: boolean;
  };
};

export function loadChildConfig(
  env: NodeJS.ProcessEnv = process.env,
): ChildConfig {
  const parsed = ChildEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      `Invalid child environment: ${parsed.error.issues
        .map(
          (issue: ZodIssue) =>
            `${issue.path.join(".") || "root"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }

  const d = parsed.data;

  return {
    discord: {
      token: d.CHILD_DISCORD_BOT_TOKEN,
      clientId: d.CHILD_DISCORD_CLIENT_ID,
      guildId: d.CHILD_DISCORD_GUILD_ID,
      channelId: d.CHILD_DISCORD_CHANNEL_ID,
      allowedUserIds: d.CHILD_DISCORD_ALLOWED_USER_IDS
        ? d.CHILD_DISCORD_ALLOWED_USER_IDS.split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
    },
    persona: {
      name: d.CHILD_NAME,
      age: d.CHILD_AGE,
    },
    ollama: {
      baseUrl: d.OLLAMA_BASE_URL,
      model: d.OLLAMA_MODEL,
      timeoutMs: d.OLLAMA_TIMEOUT_MS,
    },
    memory: {
      dir: d.CHILD_MEMORY_DIR,
      conversationMaxTurns: d.CHILD_CONVERSATION_MAX_TURNS,
      factsMax: d.CHILD_FACTS_MAX,
    },
    proactive: {
      enabled: d.CHILD_PROACTIVE_ENABLED,
      intervalMs: d.CHILD_PROACTIVE_INTERVAL_MS,
      bedtimeHour: d.CHILD_BEDTIME_HOUR,
      wakeupHour: d.CHILD_WAKEUP_HOUR,
      useOllama: d.CHILD_PROACTIVE_USE_OLLAMA,
    },
  };
}
