import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createRouterNode, latestUserRequest } from "./router.node.js";
import type { OpsPilotStateType } from "../state.js";

test("new user request is routed independently of previous incident state", async () => {
  const state: OpsPilotStateType = {
    messages: [
      new HumanMessage("Production login is broken; investigate"),
      new AIMessage("Incident report"),
      new HumanMessage("Who changed the login service recently?"),
    ],
    incidentId: "INC-001",
    environment: "production",
    service: "login-service",
    intent: "incident",
    requestStartIndex: 0,
    evidenceStartIndex: 0,
    evidence: [{
      id: "old-evidence",
      source: "logs",
      type: "log_event",
      summary: "Old incident event",
    }],
    investigationSteps: 7,
    generalSteps: 0,
    maxInvestigationSteps: 10,
    maxGeneralSteps: 6,
  };

  const route = createRouterNode(async text => {
    assert.equal(text, "Who changed the login service recently?");
    return "general";
  });
  const result = await route(state);

  assert.equal(result.intent, "general");
  assert.equal(result.requestStartIndex, 2);
  assert.equal(result.evidenceStartIndex, 1);
  assert.equal(result.investigationSteps, 0);
  assert.equal(result.incidentId, "");
  assert.equal(result.environment, "");
  assert.equal(result.service, "");
});

test("router requires a user message", () => {
  const state = { messages: [new AIMessage("Hello")] } as OpsPilotStateType;
  assert.throws(() => latestUserRequest(state), /user message is required/);
});
