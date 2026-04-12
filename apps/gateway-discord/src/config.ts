import { type ZodIssue, z } from "zod";

const DiscordGatewayEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DISCORD_ALLOWED_USER_IDS: z.string().optional(),
  API_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
});

export type DiscordGatewayConfig = {
  token: string;
  clientId: string;
  guildId?: string;
  allowedUserIds: string[];
  apiBaseUrl: string;
};

export function loadDiscordGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): DiscordGatewayConfig {
  const parsed = DiscordGatewayEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      `Invalid Discord gateway environment: ${parsed.error.issues
        .map(
          (issue: ZodIssue) =>
            `${issue.path.join(".") || "root"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }

  return {
    token: parsed.data.DISCORD_BOT_TOKEN,
    clientId: parsed.data.DISCORD_CLIENT_ID,
    guildId: parsed.data.DISCORD_GUILD_ID,
    allowedUserIds: parsed.data.DISCORD_ALLOWED_USER_IDS
      ? parsed.data.DISCORD_ALLOWED_USER_IDS.split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    apiBaseUrl: parsed.data.API_BASE_URL,
  };
}
