import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityVerifier } from "./identity.js";

const user = { id: "123e4567-e89b-12d3-a456-426614174000", agencyId: null, role: "admin", status: "active" };
function verifier(status: number, body: unknown) {
  return createIdentityVerifier("http://identity:8080/api/auth/me", (async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-token");
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch);
}
test("Identity success uses trusted business identity, including nullable agency", async () => {
  assert.equal(await verifier(200, { success: true, data: user })("Bearer test-token"), `identity:none:${user.id}`);
});
test("missing token and upstream 401 fail closed", async () => {
  await assert.rejects(verifier(200, {})(undefined), { statusCode: 401 });
  await assert.rejects(verifier(401, {})("Bearer test-token"), { statusCode: 401 });
});
test("inactive and non-admin identities are denied", async () => {
  for (const change of [{ status: "disabled" }, { role: "org_admin" }]) {
    await assert.rejects(verifier(200, { success: true, data: { ...user, ...change } })("Bearer test-token"), { statusCode: 403 });
  }
});
test("malformed, failed and unavailable Identity responses cannot authenticate", async () => {
  for (const [status, body] of [[200, { success: false, data: user }], [200, { success: true, data: {} }], [500, {}]] as const) {
    await assert.rejects(verifier(status, body)("Bearer test-token"), { statusCode: 503 });
  }
  const verify = createIdentityVerifier("http://identity:8080/api/auth/me", (async () => { throw new Error("offline"); }) as typeof fetch);
  await assert.rejects(verify("Bearer test-token"), { statusCode: 503 });
});
