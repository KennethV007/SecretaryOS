import "dotenv/config";

import { createBullMqTaskQueue } from "@secretaryos/events";
import {
  SecretaryOrchestrator,
  createInMemoryRuntimeState,
} from "@secretaryos/orchestrator";

import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config.js";

const config = loadApiConfig();
const taskQueue = createBullMqTaskQueue(config.redisUrl);
const runtime = new SecretaryOrchestrator(createInMemoryRuntimeState(), {
  taskQueue,
});
const app = buildApiApp({
  config,
  runtime,
});

await app.listen({
  host: config.apiHost,
  port: config.apiPort,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await taskQueue.close();
    await app.close();
    process.exit(0);
  });
}
