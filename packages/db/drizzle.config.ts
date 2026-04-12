import { defineConfig } from "drizzle-kit";

import { loadRepoEnv } from "./src/load-env.ts";

loadRepoEnv();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/secretary_os",
  },
  strict: true,
  verbose: true,
});
