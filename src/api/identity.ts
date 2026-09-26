import { z } from "zod";
import { ApiError } from "./errors.js";

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    agencyId: z.string().uuid().nullable(),
    role: z.string(),
    status: z.string(),
  }),
});

export function createIdentityVerifier(url: string, fetcher: typeof fetch = fetch) {
  const endpoint = new URL(url);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error("Invalid IDENTITY_ME_URL");
  }
  return async (authorization: string | undefined): Promise<string> => {
    if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
      throw new ApiError(401, "Bearer token required");
    }
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        headers: { Authorization: authorization, Accept: "application/json" },
        signal: AbortSignal.timeout(5_000), redirect: "error",
      });
    } catch { throw new ApiError(503, "Identity service unavailable"); }
    if (response.status === 401) throw new ApiError(401, "Invalid or expired identity");
    if (response.status === 403 || response.status === 404) throw new ApiError(403, "Identity access denied");
    if (!response.ok) throw new ApiError(503, "Identity service unavailable");
    let parsed;
    try { parsed = responseSchema.safeParse(await response.json()); }
    catch { throw new ApiError(503, "Invalid Identity response"); }
    if (!parsed.success) throw new ApiError(503, "Invalid Identity response");
    const user = parsed.data.data;
    if (user.role !== "admin" || user.status.toLowerCase() !== "active") {
      throw new ApiError(403, "Active admin access required");
    }
    return `identity:${user.agencyId?.toLowerCase() ?? "none"}:${user.id.toLowerCase()}`;
  };
}
