import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { searchCloudWatchLogs } from "./cloudwatch-logs.provider.js";

const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const searchLogs = tool(
  async ({ logGroupName, query, startTime, endTime, limit }) => {
    const end = endTime ? new Date(endTime) : new Date();
    const start = startTime
      ? new Date(startTime)
      : new Date(end.getTime() - 30 * 60 * 1_000);

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() - start.getTime() > MAX_WINDOW_MS ||
      end.getTime() > Date.now() + 60_000
    ) {
      throw new Error("Invalid time window: use ISO timestamps and a range of at most 24 hours.");
    }

    if (query?.includes('"')) {
      throw new Error("Search text cannot contain a double quote.");
    }

    return JSON.stringify(await searchCloudWatchLogs({
      logGroupName,
      query,
      startTime: start,
      endTime: end,
      limit,
    }));
  },
  {
    name: "search_logs",
    description:
      "Read CloudWatch log events from a discovered Log Group. Query is an optional literal phrase. Defaults to the last 30 minutes; specify an incident time window when known. Results are bounded and may be truncated.",
    schema: z.object({
      logGroupName: z.string().min(1).max(512),
      query: z.string().min(1).max(200).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
  }
);
