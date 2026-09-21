import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getRecentDeployments = tool(
  async ({ limit }) => {
    console.log(`🚀 Fetching ${limit} recent deployments...`);

    return JSON.stringify([
      {
        version: "v1.42",
        deployedAt: "2026-09-20T14:21:00+12:00",
        commit: "a81d92f",
        environment: "production",
      },
      {
        version: "v1.41",
        deployedAt: "2026-09-19T10:03:00+12:00",
        commit: "920ad11",
        environment: "production",
      },
    ]);
  },
  {
    name: "get_recent_deployments",
    description:
      "Get recent production deployments, including deployment time, version and Git commit SHA. Use this when investigating whether an incident may be related to a recent deployment.",
    schema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of recent deployments to return"),
    }),
  }
);