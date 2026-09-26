import assert from "node:assert/strict";
import test from "node:test";
import { buildApp, type ApiDependencies } from "./app.js";
import { ApiError } from "./errors.js";

const id = "123e4567-e89b-12d3-a456-426614174000";
const session = { id, owner_id: "trusted-user", title: "test", created_at: new Date(), updated_at: new Date() };
const deps: ApiDependencies = {
  verify: async token => { if (token !== "Bearer valid") throw new ApiError(401, "Unauthorized"); return "trusted-user"; },
  sessions: {
    create: async owner => ({ ...session, owner_id: owner }),
    list: async owner => owner === session.owner_id ? [session] : [],
    get: async (owner, sessionId) => owner === session.owner_id && sessionId === id ? session : null,
    turns: async () => [{ role: "agent", content: "saved answer" }],
  },
  run: async (owner, sessionId, prompt, progress) => {
    assert.equal(owner, session.owner_id); assert.equal(sessionId, id); assert.equal(prompt, "hello");
    progress("tool:list_repositories"); return "# Answer\n\nHello";
  },
};

test("health is public, session APIs require verified identity", async () => {
  const app = await buildApp(deps);
  try {
    assert.equal((await app.inject("/health")).statusCode, 200);
    assert.equal((await app.inject("/api/sessions")).statusCode, 401);
    const response = await app.inject({ method: "POST", url: "/api/sessions", headers: { authorization: "Bearer valid" } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().data.owner_id, "trusted-user");
  } finally { await app.close(); }
});
test("another verified user cannot read or run a foreign session", async () => {
  const app = await buildApp({ ...deps, verify: async () => "another-user", run: async () => { throw new Error("Must not run"); } });
  try {
    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({ method, url: `/api/sessions/${id}/messages`,
        ...(method === "POST" ? { payload: { message: "hello" } } : {}) });
      assert.equal(response.statusCode, 404);
    }
  } finally { await app.close(); }
});
test("stream emits structured progress, plain Markdown answer and completion", async () => {
  const app = await buildApp(deps);
  try {
    const response = await app.inject({ method: "POST", url: `/api/sessions/${id}/messages`,
      headers: { authorization: "Bearer valid" }, payload: { message: "hello" } });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/event-stream/);
    assert.match(response.body, /event: progress/); assert.match(response.body, /event: answer/);
    assert.match(response.body, /event: done/);
  } finally { await app.close(); }
});
test("blank input is rejected and session conflicts remain HTTP 409", async () => {
  const app = await buildApp({ ...deps, run: async () => { throw new ApiError(409, "busy"); } });
  try {
    for (const [message, status] of [["   ", 400], ["hello", 409]] as const) {
      const response = await app.inject({ method: "POST", url: `/api/sessions/${id}/messages`,
        headers: { authorization: "Bearer valid" }, payload: { message } });
      assert.equal(response.statusCode, status);
    }
  } finally { await app.close(); }
});
