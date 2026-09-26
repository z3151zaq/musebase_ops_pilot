import { Pool } from "pg";

const schema = process.env.PGSCHEMA || "musebase_ops_pilot";

if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  throw new Error("PGSCHEMA must be a simple PostgreSQL identifier.");
}

export function createDatabasePool(): Pool {
  const required = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"] as const;
  for (const name of required) {
    if (!process.env[name]) throw new Error(`Missing ${name} in the environment.`);
  }

  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" },
    options: `-c search_path=${schema},public`,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export const databaseSchema = schema;
