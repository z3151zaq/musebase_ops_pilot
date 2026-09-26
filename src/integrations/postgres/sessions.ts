import { createHash, randomUUID } from "node:crypto";
import { hostname, userInfo } from "node:os";

import type { Pool } from "pg";

import { databaseSchema } from "./client.js";

export type Session = {
  id: string;
  owner_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
};

export type StoredTurn = { role: "user" | "agent"; content: string };

const sessionsTable = `"${databaseSchema}".sessions`;
const turnsTable = `"${databaseSchema}".session_turns`;

export function localIdentity() {
  const user = userInfo();
  const ownerId = createHash("sha256")
    .update(JSON.stringify([hostname(), user.uid, user.username]))
    .digest("hex");
  return { ownerId: `local:${ownerId}`, label: `${user.username}@${hostname()}` };
}

export class SessionStore {
  constructor(private readonly pool: Pool) {}

  async setup() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${sessionsTable} (
        id UUID PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New conversation',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS sessions_owner_updated_idx
      ON ${sessionsTable} (owner_id, updated_at DESC)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${turnsTable} (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES ${sessionsTable}(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS session_turns_session_id_idx
      ON ${turnsTable} (session_id, id)
    `);
  }

  async create(ownerId: string): Promise<Session> {
    const result = await this.pool.query<Session>(
      `INSERT INTO ${sessionsTable} (id, owner_id) VALUES ($1, $2) RETURNING *`,
      [randomUUID(), ownerId],
    );
    return result.rows[0];
  }

  async list(ownerId: string): Promise<Session[]> {
    const result = await this.pool.query<Session>(
      `SELECT * FROM ${sessionsTable} WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 20`,
      [ownerId],
    );
    return result.rows;
  }

  async get(ownerId: string, sessionId: string): Promise<Session | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return null;
    }
    const result = await this.pool.query<Session>(
      `SELECT * FROM ${sessionsTable} WHERE id = $1 AND owner_id = $2`,
      [sessionId, ownerId],
    );
    return result.rows[0] ?? null;
  }

  async activate(ownerId: string, sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${sessionsTable} SET updated_at = now() WHERE id = $1 AND owner_id = $2`,
      [sessionId, ownerId],
    );
  }

  async turns(ownerId: string, sessionId: string): Promise<StoredTurn[]> {
    const result = await this.pool.query<StoredTurn>(
      `SELECT t.role, t.content FROM ${turnsTable} t
       JOIN ${sessionsTable} s ON s.id = t.session_id
       WHERE s.id = $1 AND s.owner_id = $2 ORDER BY t.id`,
      [sessionId, ownerId],
    );
    return result.rows;
  }

  async appendPair(ownerId: string, sessionId: string, question: string, answer: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE ${sessionsTable}
         SET title = CASE WHEN title = 'New conversation' THEN $3 ELSE title END,
             updated_at = now()
         WHERE id = $1 AND owner_id = $2 RETURNING id`,
        [sessionId, ownerId, question.replace(/\s+/g, " ").slice(0, 100)],
      );
      if (updated.rowCount !== 1) throw new Error("Session not found for this local user.");
      await client.query(
        `INSERT INTO ${turnsTable} (session_id, role, content)
         VALUES ($1, 'user', $2), ($1, 'agent', $3)`,
        [sessionId, question, answer],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
