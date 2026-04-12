import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema.js";

export type DatabaseSchema = typeof schema;
export type DatabaseClient = PostgresJsDatabase<DatabaseSchema>;

export type DatabaseHandle = {
  db: DatabaseClient;
  sql: Sql;
};

export function createDatabaseHandle(
  connectionString = process.env.DATABASE_URL,
): DatabaseHandle {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a database handle.");
  }

  const sql = postgres(connectionString, {
    max: 1,
  });

  return {
    db: drizzle(sql, { schema }),
    sql,
  };
}
