import "dotenv/config";
import { createRuntime } from "../agent/runtime.js";
import { buildApp } from "./app.js";
import { createIdentityVerifier } from "./identity.js";

const verify = createIdentityVerifier(process.env.IDENTITY_ME_URL || "http://identity:8080/api/auth/me");
const runtime = await createRuntime();
try {
  const app = await buildApp({ ...runtime, verify });
  app.addHook("onClose", async () => runtime.close());
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { void app.close(); });
  }
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 8080) });
} catch (error) { await runtime.close(); throw error; }
