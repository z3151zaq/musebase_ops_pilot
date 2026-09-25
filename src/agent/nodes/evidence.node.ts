import { ToolMessage } from "@langchain/core/messages";

import type {
  OpsPilotStateType,
} from "../state.js";

import type {
  Evidence,
  EvidenceSource,
  EvidenceType,
} from "../evidence.js";

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
): Evidence {
  const data = parseToolContent(message);

  switch (message.name) {
    case "search_logs": {
      const logs = data as {
        timestamp?: string;
        summary?: string;
        error?: string;
      };

      return {
        id: crypto.randomUUID(),

        source: "logs",

        type: "error",

        timestamp: logs.timestamp,

        summary: logs.summary ?? logs.error ?? "Production log evidence collected.",

        rawData: data,
      };
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

function getEvidenceMetadata(
  toolName?: string
): {
  source: EvidenceSource;
  type: EvidenceType;
} {
  switch (toolName) {
    case "search_logs":
      return {
        source: "logs",
        type: "error",
      };

    case "get_recent_deployments":
      return {
        source: "deployment",
        type: "deployment",
      };

    case "get_commit":
      return {
        source: "github",
        type: "code_change",
      };

    default:
      throw new Error(
        `Unsupported evidence tool: ${toolName}`
      );
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

  const evidence = toolMessages.filter(message => evidenceToolNames.has(message.name ?? "")).map(toolMessageToEvidence);

  for (const item of evidence) {
    console.log(
      `📌 Evidence collected: ${item.source} — ${item.summary}`
    );
  }

  return {
    evidence,
  };
}