import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const searchLogs = tool(
  async ({ query }) => {
    console.log(`🔍 Searching production logs: ${query}`);

    // 现在先返回 mock data
    return JSON.stringify({
  timestamp: "2026-09-20T14:26:13+12:00",

  endpoint: "POST /api/orders",

  error: "ValidationException: customer_id cannot be null",

  errorRateBefore: 0.8,

  errorRateAfter: 12.4,

  summary:
    "Order API error rate increased from 0.8% to 12.4%.",
});
  },
  {
    name: "search_logs",

    description:
      "Search production application logs for errors, exceptions, API failures, and other operational issues.",

    schema: z.object({
      query: z
        .string()
        .describe("The search query used to find relevant production logs"),
    }),
  }
);