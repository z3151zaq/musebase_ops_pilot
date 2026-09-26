import "dotenv/config";

import { createDatabasePool, databaseSchema } from "./client.js";

const pool = createDatabasePool();

try {
  const result = await pool.query<{
    database: string;
    schema: string | null;
    role: string;
    schema_exists: boolean;
  }>(
    `SELECT current_database() AS database,
            current_schema() AS schema,
            current_user AS role,
            to_regnamespace($1) IS NOT NULL AS schema_exists`,
    [databaseSchema],
  );

  const connection = result.rows[0];
  if (!connection.schema_exists || connection.schema !== databaseSchema) {
    throw new Error(`Connected, but schema ${databaseSchema} is unavailable to this role.`);
  }

  console.log(`PostgreSQL connected: database=${connection.database}, schema=${connection.schema}, role=${connection.role}`);
} catch (error) {
  console.error("PostgreSQL connection check failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
