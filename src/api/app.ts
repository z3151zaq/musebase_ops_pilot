import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import type { SessionStore } from "../integrations/postgres/sessions.js";
import { ApiError } from "./errors.js";

declare module "fastify" { interface FastifyRequest { ownerId: string; } }

export type ApiDependencies = {
  sessions: Pick<SessionStore, "create" | "list" | "get" | "turns">;
  verify: (authorization: string | undefined) => Promise<string>;
  run: (owner: string, id: string, prompt: string, progress: (step: string) => void,
    signal: AbortSignal) => Promise<string>;
};

const paramsSchema = {
  type: "object", required: ["id"], additionalProperties: false,
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export async function buildApp(deps: ApiDependencies) {
  const app = Fastify({ bodyLimit: 64 * 1024, logger: {
    redact: ["req.headers.authorization", "req.headers.cookie"],
  } });
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  app.decorateRequest("ownerId", "");
  app.setErrorHandler((error, _request, reply) => {
    const validation = typeof error === "object" && error !== null && "validation" in error;
    const reported = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
    const status = error instanceof ApiError ? error.statusCode : validation ? 400 :
      typeof reported === "number" && reported >= 400 && reported < 500 ? reported : 500;
    reply.code(status).send({ success: false, data: null,
      msg: status === 500 ? "Internal server error" : error instanceof Error ? error.message : "Invalid request" });
  });
  app.get("/health", async () => ({ status: "ok" }));
  await app.register(async api => {
    api.addHook("preHandler", async request => {
      request.ownerId = await deps.verify(request.headers.authorization);
    });
    api.get("/sessions", async request => ({ success: true, data: await deps.sessions.list(request.ownerId) }));
    api.post("/sessions", async (request, reply) => {
      const session = await deps.sessions.create(request.ownerId);
      return reply.code(201).send({ success: true, data: session });
    });
    api.get<{ Params: { id: string } }>("/sessions/:id/messages", { schema: { params: paramsSchema } },
      async request => {
        if (!await deps.sessions.get(request.ownerId, request.params.id)) throw new ApiError(404, "Session not found");
        return { success: true, data: await deps.sessions.turns(request.ownerId, request.params.id) };
      });
    api.post<{ Params: { id: string }; Body: { message: string } }>("/sessions/:id/messages", {
      schema: { params: paramsSchema, body: {
        type: "object", required: ["message"], additionalProperties: false,
        properties: { message: { type: "string", minLength: 1, maxLength: 16000 } },
      } },
    }, async (request, reply) => {
      const prompt = request.body.message.trim();
      if (!prompt) throw new ApiError(400, "Message must not be blank");
      if (!await deps.sessions.get(request.ownerId, request.params.id)) throw new ApiError(404, "Session not found");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300_000);
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let opened = false;
      reply.raw.on("close", () => controller.abort());
      const open = () => {
        if (opened) return;
        reply.hijack();
        reply.raw.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
        opened = true;
        heartbeat = setInterval(() => {
          if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
        }, 15_000);
      };
      const send = (event: string, data: unknown) => {
        if (reply.raw.destroyed) return;
        open();
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (reply.raw.writableLength > 1024 * 1024) controller.abort();
      };
      try {
        const answer = await deps.run(request.ownerId, request.params.id, prompt,
          step => send("progress", { step }), controller.signal);
        send("answer", { text: answer });
        send("done", { sessionId: request.params.id });
      } catch (error) {
        if (!opened) throw error;
        send("error", { message: error instanceof ApiError ? error.message : "Agent run failed or cancelled" });
      } finally {
        clearTimeout(timer);
        if (heartbeat) clearInterval(heartbeat);
        if (opened && !reply.raw.destroyed) reply.raw.end();
      }
    });
  }, { prefix: "/api" });
  return app;
}
