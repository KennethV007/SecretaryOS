import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ZodIssue, z } from "zod";

const ApiEnvSchema = z.object({
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(8),
  INTERNAL_API_KEY: z.string().min(8),
  PERSONA_PACK_ROOT: z.string().min(1).default("data/persona-packs"),
  SKILL_PACK_ROOT: z.string().min(1).default("data/skills"),
  ACTIVE_CHARACTER_PATH: z
    .string()
    .min(1)
    .default("data/active-character.json"),
});

export type ApiConfig = {
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  internalApiKey: string;
  personaPackRoot: string;
  skillPackRoot: string;
  activeCharacterPath: string;
};

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = ApiEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      `Invalid API environment: ${parsed.error.issues
        .map(
          (issue: ZodIssue) =>
            `${issue.path.join(".") || "root"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }

  const repoRoot = resolve(
    fileURLToPath(new URL("../../../", import.meta.url)),
  );

  return {
    apiHost: parsed.data.API_HOST,
    apiPort: parsed.data.API_PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    sessionSecret: parsed.data.SESSION_SECRET,
    internalApiKey: parsed.data.INTERNAL_API_KEY,
    personaPackRoot: resolve(repoRoot, parsed.data.PERSONA_PACK_ROOT),
    skillPackRoot: resolve(repoRoot, parsed.data.SKILL_PACK_ROOT),
    activeCharacterPath: resolve(repoRoot, parsed.data.ACTIVE_CHARACTER_PATH),
  };
}
