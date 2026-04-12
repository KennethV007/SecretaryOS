import "dotenv/config";

import { createApiBackedWorkerDependencies } from "./api-client.js";
import { loadWorkerConfig } from "./config.js";
import { createBullMqTaskWorker } from "./queue.js";

const config = loadWorkerConfig();
const workerHandle = createBullMqTaskWorker(
  config.redisUrl,
  createApiBackedWorkerDependencies({
    apiBaseUrl: config.apiBaseUrl,
    internalApiKey: config.internalApiKey,
  }),
  {
    concurrency: config.concurrency,
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await workerHandle.close();
    process.exit(0);
  });
}
