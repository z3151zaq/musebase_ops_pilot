import { ChatOpenAI } from "@langchain/openai";

import {
  END,
  START,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";

import { ToolNode } from "@langchain/langgraph/prebuilt";

import { SystemMessage } from "@langchain/core/messages";

import { searchLogs } from "../tools/logs.tool.js";
import { getRecentDeployments } from "../tools/deployment.tool.js";
import { getCommit } from "../tools/github.tool.js";

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
  state: typeof MessagesAnnotation.State
) {
  console.log("\n🧠 Investigator running...");
  const response = await modelWithTools.invoke([
    new SystemMessage(SYSTEM_PROMPT),
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
  };
}


/**
 * 决定下一步去哪里
 */
function shouldContinue(
  state: typeof MessagesAnnotation.State
) {
  const lastMessage =
    state.messages[state.messages.length - 1];

  if (
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  ) {
    return "tools";
  }

  return END;
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


/**
 * Build Graph
 */
const workflow = new StateGraph(MessagesAnnotation)

  .addNode("investigator", investigator)

  .addNode("tools", toolNode)

  .addEdge(
    START,
    "investigator"
  )

  .addConditionalEdges(
    "investigator",
    shouldContinue,
    ["tools", END]
  )

  .addEdge(
    "tools",
    "investigator"
  );


export const graph = workflow.compile();