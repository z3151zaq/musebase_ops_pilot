import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";

import { graph } from "./agent/graph.js";

const incidentId = "INC-001";

const config = {
  configurable: {
    thread_id: incidentId,
  },
};

const result = await graph.invoke({
  incidentId,

  environment: "production",

  service: "talent-service",

  investigationSteps: 0,

  maxInvestigationSteps: 10,

  messages: [
    new HumanMessage(
      "Investigate recent production issues affecting talent-service. Discover relevant CloudWatch Log Groups, inspect logs from the past hour, and check whether recent GitHub Actions deployment steps could be related."
    ),
  ],
}, config);

console.log(
  "\n========== INCIDENT REPORT ==========\n"
);

const lastMessage =
  result.messages[result.messages.length - 1];

console.log(lastMessage.content);

const snapshot =
  await graph.getState(config);

console.log(
  "\n========== CHECKPOINT ==========\n"
);

console.log({
  incidentId:
    snapshot.values.incidentId,

  environment:
    snapshot.values.environment,

  service:
    snapshot.values.service,

  investigationSteps:
    snapshot.values.investigationSteps,

  messageCount:
    snapshot.values.messages.length,
});

console.log(
  "\n========== EVIDENCE ==========\n"
);

console.log(
  JSON.stringify(
    result.evidence,
    null,
    2
  )
);
// const secondResult = await graph.invoke(
//   {
//     messages: [
//       new HumanMessage(
//         "What evidence did you find during the investigation?"
//       ),
//     ],
//   },
//   config
// );

// const secondLastMessage =
//   secondResult.messages[
//     secondResult.messages.length - 1
//   ];

// console.log(
//   "\n========== FOLLOW-UP ==========\n"
// );

// console.log(secondLastMessage.content);
