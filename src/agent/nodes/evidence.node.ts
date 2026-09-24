import { ToolMessage } from "@langchain/core/messages";

import type {
  OpsPilotStateType,
} from "../state.js";

import type {
  Evidence,
  EvidenceSource,
  EvidenceType,
} from "../evidence.js";


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

  const lastMessage =
    state.messages[
      state.messages.length - 1
    ];

  if (!(lastMessage instanceof ToolMessage)) {
    return {};
  }

  const metadata =
    getEvidenceMetadata(lastMessage.name);

  const evidence: Evidence = {
    id: crypto.randomUUID(),

    source: metadata.source,

    type: metadata.type,

    summary: String(lastMessage.content),

    rawData: lastMessage.content,
  };

  console.log(
    `📌 Evidence collected: ${evidence.id}`
  );

  return {
    evidence: [evidence],
  };
}