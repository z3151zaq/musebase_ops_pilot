import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";

import { graph } from "./agent/graph.js";


const result = await graph.invoke({
  messages: [
    new HumanMessage(
      "Users are reporting that order creation started failing this afternoon. Investigate the issue."
    ),
  ],
});


console.log("\n========== INCIDENT REPORT ==========\n");

const lastMessage =
  result.messages[result.messages.length - 1];

console.log(lastMessage.content);