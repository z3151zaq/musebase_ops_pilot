import { ChatOpenAI } from "@langchain/openai";

import {
  END,
  START,
  StateGraph,
  MemorySaver,
} from "@langchain/langgraph";

import {OpsPilotState, OpsPilotStateType} from "./state.js";

import { ToolNode } from "@langchain/langgraph/prebuilt";


import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { searchLogs } from "../integrations/aws/logs.tool.js";
import { discoverLogGroupsTool } from "../integrations/aws/discover-log-groups.tool.js";

import { listRepositories } from "../integrations/github/list-repositories.tool.js";

import { reportNode } from "./nodes/report.node.js";
import { evidenceNode } from "./nodes/evidence.node.js";
import { routerNode } from "./nodes/router.node.js";
  
import { GENERAL_PROMPT, SYSTEM_PROMPT } from "./prompts.js";
import { listRecentCommits } from "../integrations/github/list-recent-commits.tool.js";
import { getCommit } from "../integrations/github/get-commit.tool.js";
import { getFileContent } from "../integrations/github/get-file-content.tool.js";
import { listRepositoryFiles } from "../integrations/github/list-repository-files.tool.js";
import { listWorkflows } from "../integrations/github/list-workflows.tool.js";
import { listWorkflowRuns } from "../integrations/github/list-workflow-runs.tool.js";
import { inspectWorkflowRun } from "../integrations/github/inspect-workflow-run.tool.js";


const githubTools = [
  listRepositories,
  listWorkflows,
  listWorkflowRuns,
  inspectWorkflowRun,
  listRecentCommits,
  getCommit,
  getFileContent,
  listRepositoryFiles,
];

const incidentTools = [
  discoverLogGroupsTool,
  searchLogs,
  ...githubTools,
];


const model = new ChatOpenAI({
  model: "gpt-5.6-luna",
  useResponsesApi: true,
});


const incidentModel = model.bindTools(incidentTools);
const generalModel = model.bindTools(githubTools);

function requestMessages(state: OpsPilotStateType) {
  return state.messages.slice(state.requestStartIndex);
}

function generalConversationMessages(state: OpsPilotStateType) {
  const previousTurns = state.messages
    .slice(0, state.requestStartIndex)
    .filter(message => message instanceof HumanMessage ||
      (message instanceof AIMessage && !message.tool_calls?.length));
  return [...previousTurns.slice(-12), ...requestMessages(state)];
}

function routeAfterRouter(state: OpsPilotStateType): "general" | "investigator" {
  return state.intent === "incident" ? "investigator" : "general";
}

async function generalInvestigator(state: OpsPilotStateType) {
  const response = await generalModel.invoke([
    new SystemMessage(GENERAL_PROMPT),
    ...generalConversationMessages(state),
  ]);

  return {
    messages: [response],
    generalSteps: state.generalSteps + 1,
  };
}

function routeAfterGeneral(state: OpsPilotStateType): "generalTools" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1];
  return "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
    ? "generalTools"
    : END;
}

function routeAfterGeneralTools(state: OpsPilotStateType): "general" | "generalAnswer" {
  return state.generalSteps >= state.maxGeneralSteps
    ? "generalAnswer"
    : "general";
}

async function generalAnswer(state: OpsPilotStateType) {
  const response = await model.invoke([
    new SystemMessage(`${GENERAL_PROMPT}\nAnswer now using the information already gathered. Do not request more tools.`),
    ...generalConversationMessages(state),
  ]);

  return { messages: [response] };
}


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

  const response = await incidentModel.invoke([
    new SystemMessage(`
${SYSTEM_PROMPT}

Incident context:
- Incident ID: ${state.incidentId || "not provided"}
- Environment: ${state.environment || "not provided"}
- Service: ${state.service || "not provided"}
    `),
    ...requestMessages(state),
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

    // 直接记录下一次调查步数，避免跨轮次累计。
    investigationSteps: state.investigationSteps + 1,
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
const toolNode = new ToolNode(incidentTools);
const generalToolNode = new ToolNode(githubTools);

const checkpointer = new MemorySaver();

/**
 * Build Graph
 */
const workflow = new StateGraph(
  OpsPilotState
)
  .addNode("router", routerNode)
  .addNode("general", generalInvestigator)
  .addNode("generalTools", generalToolNode)
  .addNode("generalAnswer", generalAnswer)
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
    "router"
  )

  .addConditionalEdges(
    "router",
    routeAfterRouter,
    ["general", "investigator"]
  )

  .addConditionalEdges(
    "general",
    routeAfterGeneral,
    ["generalTools", END]
  )

  .addConditionalEdges(
    "generalTools",
    routeAfterGeneralTools,
    ["general", "generalAnswer"]
  )

  .addEdge("generalAnswer", END)

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
