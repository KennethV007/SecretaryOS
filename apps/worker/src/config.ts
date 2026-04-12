import { type ZodIssue, z } from "zod";

const WorkerEnvSchema = z.object({
  REDIS_URL: z.string().url(),
  INTERNAL_API_KEY: z.string().min(8),
  API_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
});

export type WorkerConfig = {
  redisUrl: string;
  apiBaseUrl: string;
  internalApiKey: string;
  concurrency: number;
};

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = WorkerEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      `Invalid worker environment: ${parsed.error.issues
        .map(
          (issue: ZodIssue) =>
            `${issue.path.join(".") || "root"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }

  return {
    redisUrl: parsed.data.REDIS_URL,
    apiBaseUrl: parsed.data.API_BASE_URL,
    internalApiKey: parsed.data.INTERNAL_API_KEY,
    concurrency: parsed.data.WORKER_CONCURRENCY,
  };
}
