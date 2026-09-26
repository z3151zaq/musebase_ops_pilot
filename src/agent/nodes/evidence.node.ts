import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

import type {
  OpsPilotStateType,
} from "../state.js";

import type {
  Evidence,
} from "../evidence.js";

const logSearchResultSchema = z.object({
  logGroupName: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  query: z.string().optional(),
  events: z.array(z.object({
    timestamp: z.string(),
    message: z.string(),
    logStreamName: z.string().optional(),
  })),
  matchedEventsRead: z.number(),
  truncated: z.boolean(),
});

const evidenceToolNames =
  new Set([
    "search_logs",
    "get_recent_deployments",
    "get_commit",
    "get_file_content",
  ]);

function getLatestToolMessages(
  messages: OpsPilotStateType["messages"]
): ToolMessage[] {
  const toolMessages: ToolMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    if (!(message instanceof ToolMessage)) {
      break;
    }

    toolMessages.unshift(message);
  }

  return toolMessages;
}

function parseToolContent(
  message: ToolMessage
): unknown {
  if (typeof message.content !== "string") {
    return message.content;
  }

  try {
    return JSON.parse(message.content);
  } catch {
    return message.content;
  }
}

function toolMessageToEvidence(
  message: ToolMessage
): Evidence | Evidence[] | null {
  const data = parseToolContent(message);

  switch (message.name) {
    case "search_logs": {
      const parsed = logSearchResultSchema.safeParse(data);
      if (!parsed.success) {
        return null;
      }

      const result = parsed.data;
      const searchEvidence: Evidence = {
        id: crypto.randomUUID(),
        source: "logs",
        type: "log_search",
        resource: result.logGroupName,
        summary: `Searched ${result.logGroupName} from ${result.startTime} to ${result.endTime}${result.query ? ` for "${result.query}"` : ""}; ${result.events.length} events returned${result.truncated ? " (scan truncated)" : ""}.`,
        rawData: {
          query: result.query,
          startTime: result.startTime,
          endTime: result.endTime,
          matchedEventsRead: result.matchedEventsRead,
          truncated: result.truncated,
        },
      };

      return [searchEvidence, ...result.events.map(event => ({
        id: crypto.randomUUID(),
        source: "logs" as const,
        type: "log_event" as const,
        timestamp: event.timestamp,
        resource: result.logGroupName,
        summary: event.message.slice(0, 500),
        rawData: {
          logStreamName: event.logStreamName,
          message: event.message,
          query: result.query,
          truncated: result.truncated,
        },
      }))];
    }

    case "get_recent_deployments": {
      const deployments = data as Array<{
        version: string;
        deployedAt: string;
        commit: string;
      }>;

      const latest = deployments[0];

      return {
        id: crypto.randomUUID(),

        source: "deployment",

        type: "deployment",

        timestamp: latest?.deployedAt,

        summary: latest
          ? `${latest.version} was deployed at ${latest.deployedAt} from commit ${latest.commit}.`
          : "No recent deployments found.",

        rawData: data,
      };
    }

case "get_commit": {
  if (
    typeof data !== "object" ||
    data === null ||
    !("sha" in data)
  ) {
    return null;
  }

  const commit = data as {
    repository: string;
    sha: string;
    message: string;
    author?: string;
    committedAt?: string;
    files?: Array<{
      filename: string;
      status: string;
      patch?: string;
    }>;
  };

  const title =
    commit.message
      ?.split("\n")[0] ??
    "Unknown commit";

  const changedFiles =
    commit.files
      ?.map(file => file.filename)
      .join(", ") ??
    "unknown files";

  return {
    id: crypto.randomUUID(),
    source: "github",
    type: "code_change",
    timestamp: commit.committedAt,
    resource: commit.repository,

    summary:
      `Commit ${commit.sha}: "${title}". ` +
      `Changed files: ${changedFiles}.`,

    rawData: commit,
  };
}

    case "get_file_content": {
      const file = data as {
        repository?: string;
        path?: string;
        sha?: string;
        content?: string;
      };

      return {
        id: crypto.randomUUID(),

        source: "github",

        type: "source_code",

        resource: file.repository,

        summary:
          `Source file ${file.path ?? "unknown"} ` +
          `was inspected from repository ` +
          `${file.repository ?? "unknown"}.`,

        rawData: data,
      };
    }
    default:
      throw new Error(`Unsupported evidence tool: ${message.name}`);
  }
}

export async function evidenceNode(
  state: OpsPilotStateType
) {
  console.log(
    "\n📚 Extracting evidence..."
  );

  const toolMessages =
    getLatestToolMessages(state.messages);

  if (toolMessages.length === 0) {
    return {};
  }

  const evidence = toolMessages
    .filter(message => evidenceToolNames.has(message.name ?? ""))
    .map(toolMessageToEvidence)
    .flatMap(item => item === null ? [] : Array.isArray(item) ? item : [item]);

  for (const item of evidence) {
    console.log(
      `📌 Evidence collected: ${item.source} — ${item.summary}`
    );
  }

  return {
    evidence,
  };
}
