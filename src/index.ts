import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";

import { graph } from "./agent/graph.js";

const result = await graph.invoke({
  incidentId: "INC-001",

  environment: "production",

  service: "order-service",

  investigationSteps: 0,

  maxInvestigationSteps: 2,

  messages: [
    new HumanMessage(
      "Users are reporting that order creation started failing this afternoon. Investigate the issue."
    ),
  ],
});

console.log(
  "\n========== INCIDENT REPORT ==========\n"
);

const lastMessage =
  result.messages[result.messages.length - 1];

console.log(lastMessage.content);

console.log(
  "\n========== METADATA ==========\n"
);

console.log({
  incidentId: result.incidentId,
  environment: result.environment,
  service: result.service,
  investigationSteps:
    result.investigationSteps,
});