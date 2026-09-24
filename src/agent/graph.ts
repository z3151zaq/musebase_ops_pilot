import { ChatOpenAI } from "@langchain/openai";

import {
  END,
  START,
  MessagesAnnotation,
  StateGraph,
  MemorySaver,
} from "@langchain/langgraph";

import {OpsPilotState, OpsPilotStateType} from "./state.js";

import { ToolNode } from "@langchain/langgraph/prebuilt";


import { SystemMessage } from "@langchain/core/messages";

import { searchLogs } from "../tools/logs.tool.js";
import { getRecentDeployments } from "../tools/deployment.tool.js";
import { getCommit } from "../tools/github.tool.js";
import { reportNode } from "./nodes/report.node.js";
import { evidenceNode } from "./nodes/evidence.node.js";

import { SYSTEM_PROMPT } from "./prompts.js";


const tools = [
  searchLogs,
  getRecentDeployments,
  getCommit,
];


const model = new ChatOpenAI({
  model: "gpt-5.6-luna",
  useResponsesApi: true,
});


const modelWithTools = model.bindTools(tools);


/**
 * Investigator node
 *
 * LangGraph 把当前 state 传进来，
 * 我们把 messages 发给 LLM。
 */
async function investigator(
  state: OpsPilotStateType
) {
  console.log(
    `\n🧠 Investigation step ${state.investigationSteps + 1}`
  );

  console.log(
    `Incident: ${state.incidentId}`
  );

  console.log(
    `Environment: ${state.environment}`
  );

  console.log(
    `Service: ${state.service}`
  );

  const response = await modelWithTools.invoke([
    new SystemMessage(`
${SYSTEM_PROMPT}

Incident context:
- Incident ID: ${state.incidentId}
- Environment: ${state.environment}
- Service: ${state.service}
    `),
    ...state.messages,
  ]);

  if (response.tool_calls?.length) {
    for (const toolCall of response.tool_calls) {
      console.log(
        `🔧 Requesting tool: ${toolCall.name}`,
        toolCall.args
      );
    }
  } else {
    console.log("✅ Investigation complete.");
  }

  return {
    messages: [response],

    // reducer 会执行 current + 1
    investigationSteps: 1,
  };
}


/**
 * 决定下一步去哪里
 */
function routeAfterInvestigator(
  state: OpsPilotStateType
): "tools" | "report" {
  const lastMessage =
    state.messages[state.messages.length - 1];

  const hasToolCalls =
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0;

  if (hasToolCalls) {
    return "tools";
  }

  return "report";
}

function routeAfterEvidence(
  state: OpsPilotStateType
): "investigator" | "report" {
  if (
    state.investigationSteps >=
    state.maxInvestigationSteps
  ) {
    console.log(
      `⚠️ Maximum investigation steps reached: ${state.maxInvestigationSteps}`
    );

    return "report";
  }

  return "investigator";
}

/**
 * ToolNode 自动：
 *
 * 读取 AIMessage.tool_calls
 * ↓
 * 找对应 Tool
 * ↓
 * invoke()
 * ↓
 * 生成 ToolMessage
 */
const toolNode = new ToolNode(tools);

const checkpointer = new MemorySaver();

/**
 * Build Graph
 */
const workflow = new StateGraph(
  OpsPilotState
)
  .addNode(
    "investigator",
    investigator
  )

  .addNode(
    "tools",
    toolNode
  )

  .addNode(
  "extractEvidence",
  evidenceNode
)

  .addNode(
    "report",
    reportNode
  )

  .addEdge(
    START,
    "investigator"
  )

.addConditionalEdges(
  "investigator",
  routeAfterInvestigator,
  ["tools", "report"]
)

.addEdge(
  "tools",
  "extractEvidence"
)

.addConditionalEdges(
  "extractEvidence",
  routeAfterEvidence,
  ["investigator", "report"]
)

  .addEdge(
    "report",
    END
  );


export const graph = workflow.compile({
  checkpointer,
});