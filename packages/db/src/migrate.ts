import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabaseHandle } from "./client.js";
import { loadRepoEnv } from "./load-env.js";

loadRepoEnv();

async function main() {
  const { db, sql } = createDatabaseHandle();
  const migrationsFolder = fileURLToPath(
    new URL("../drizzle", import.meta.url),
  );

  await migrate(db, {
    migrationsFolder,
  });

  await sql.end();
}

main().catch((error) => {
  console.error("Failed to run database migrations.", error);
  process.exitCode = 1;
});
