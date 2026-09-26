import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { discoverLogGroups } from "./cloudwatch-logs.provider.js";

export const discoverLogGroupsTool = tool(
  async ({ prefix, nextToken, limit }) =>
    JSON.stringify(await discoverLogGroups({ prefix, nextToken, limit })),
  {
    name: "discover_log_groups",
    description:
      "Discover CloudWatch Log Groups in the current AWS account and Region. Use this before searching logs. An optional prefix narrows the discovery; follow nextToken to see more groups.",
    schema: z.object({
      prefix: z.string().max(512).optional(),
      nextToken: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(50),
    }),
  }
);
