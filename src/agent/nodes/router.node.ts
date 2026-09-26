import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { ROUTER_PROMPT } from "../prompts.js";
import type { OpsPilotStateType, RequestIntent } from "../state.js";

const routerModel = new ChatOpenAI({
  model: "gpt-5.6-luna",
  useResponsesApi: true,
}).withStructuredOutput(z.object({
  intent: z.enum(["general", "incident"]),
}));

export function latestUserRequest(state: OpsPilotStateType): {
  index: number;
  text: string;
} {
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const message = state.messages[index];
    if (message instanceof HumanMessage) {
      return {
        index,
        text: typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
      };
    }
  }

  throw new Error("A user message is required to route the request.");
}

export function createRouterNode(
  classify: (text: string) => Promise<RequestIntent>
) {
  return async (state: OpsPilotStateType) => {
    const request = latestUserRequest(state);
    const intent = await classify(request.text);

    return {
      intent,
      requestStartIndex: request.index,
      evidenceStartIndex: state.evidence.length,
      investigationSteps: 0,
      generalSteps: 0,
      // A new user turn must not inherit the preceding incident's context.
      ...(request.index > 0 ? {
        incidentId: "",
        environment: "",
        service: "",
      } : {}),
    };
  };
}

export const routerNode = createRouterNode(async text => {
  const classification = await routerModel.invoke([
    new SystemMessage(ROUTER_PROMPT),
    new HumanMessage(text),
  ]);
  return classification.intent;
});
