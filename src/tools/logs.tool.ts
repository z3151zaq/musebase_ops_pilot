import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const searchLogs = tool(
  async ({ query }) => {
    console.log(`🔍 Searching production logs: ${query}`);

    // 现在先返回 mock data
    return `
      2026-09-20 14:26:13 ERROR
      POST /api/orders

      ValidationException:
      customer_id cannot be null

      Error rate increased from 0.8% to 12.4%
      starting at 14:26.
    `;
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