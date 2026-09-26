import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createGraph } from "./graph.js";
import { createDatabasePool, databaseSchema } from "../integrations/postgres/client.js";
import { SessionStore } from "../integrations/postgres/sessions.js";
import { ApiError } from "../api/errors.js";

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(block => block?.type === "text" && typeof block.text === "string")
    .map(block => block.text).join("\n\n");
}

export async function createRuntime() {
  const pool = createDatabasePool();
  const sessions = new SessionStore(pool);
  const saver = new PostgresSaver(pool, undefined, { schema: databaseSchema });
  try { await saver.setup(); await sessions.setup(); }
  catch (error) { await pool.end(); throw error; }
  const graph = createGraph(saver);
  let active = 0;
  return {
    sessions,
    close: () => pool.end(),
    async run(owner: string, id: string, prompt: string, progress: (step: string) => void,
      signal?: AbortSignal): Promise<string> {
      if (!await sessions.get(owner, id)) throw new ApiError(404, "Session not found");
      if (active >= 2) throw new ApiError(429, "Agent capacity reached; retry later");
      active++;
      let client;
      let locked = false;
      try {
        client = await pool.connect();
        const lock = await client.query<{ locked: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [id]);
        locked = lock.rows[0].locked;
        if (!locked) throw new ApiError(409, "Session already has an active run");
        signal?.throwIfAborted();
        progress("started");
        const config = { configurable: { thread_id: id }, streamMode: "updates" as const, signal };
        const stream = await graph.stream({ messages: [new HumanMessage(prompt)] }, config);
        for await (const chunk of stream) {
          signal?.throwIfAborted();
          for (const [node, update] of Object.entries(chunk as Record<string, { messages?: unknown[] }>)) {
            progress(node);
            const message = update?.messages?.at(-1);
            if (message instanceof AIMessage) {
              for (const call of message.tool_calls ?? []) progress(`tool:${call.name}`);
            }
          }
        }
        signal?.throwIfAborted();
        const snapshot = await graph.getState(config);
        const answer = contentToText(snapshot.values.messages.at(-1)?.content);
        await sessions.appendPair(owner, id, prompt, answer);
        return answer;
      } finally {
        if (client) {
          try {
            if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [id]);
            client.release();
          } catch { client.release(true); }
        }
        active--;
      }
    },
  };
}
