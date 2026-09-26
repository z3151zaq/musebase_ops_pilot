import "dotenv/config";

import { HumanMessage } from "@langchain/core/messages";

import { graph } from "./agent/graph.js";

const inputArgs = process.argv.slice(2);
const prompt = (inputArgs[0] === "--" ? inputArgs.slice(1) : inputArgs)
  .join(" ")
  .trim();

if (!prompt) {
  console.error('Usage: pnpm start "Ask about Musebase or report an incident"');
  process.exit(1);
}

const config = {
  configurable: {
    thread_id: crypto.randomUUID(),
  },
};

const result = await graph.invoke({
  messages: [new HumanMessage(prompt)],
}, config);

const lastMessage = result.messages[result.messages.length - 1];
console.log("\n========== ANSWER ==========\n");
console.log(lastMessage.content);

const snapshot = await graph.getState(config);
console.log("\n========== REQUEST ==========\n");
console.log({
  intent: snapshot.values.intent,
  investigationSteps: snapshot.values.investigationSteps,
  generalSteps: snapshot.values.generalSteps,
  evidenceCount: snapshot.values.evidence.length - snapshot.values.evidenceStartIndex,
});
