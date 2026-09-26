import assert from "node:assert/strict";
import test from "node:test";

import { ToolMessage } from "@langchain/core/messages";

import { evidenceNode } from "./evidence.node.js";
import type { OpsPilotStateType } from "../state.js";
import { redactLogMessage } from "../../integrations/aws/cloudwatch-logs.provider.js";

function stateWithMessage(message: ToolMessage): OpsPilotStateType {
  return {
    messages: [message],
    incidentId: "INC-test",
    environment: "production",
    service: "talent-service",
    evidence: [],
    investigationSteps: 1,
    maxInvestigationSteps: 10,
  };
}

test("CloudWatch search events become source-attributed evidence", async () => {
  const toolMessage = new ToolMessage({
    name: "search_logs",
    tool_call_id: "call-1",
    content: JSON.stringify({
      logGroupName: "/musebase_api/production/talent-service",
      startTime: "2026-09-26T00:00:00.000Z",
      endTime: "2026-09-26T01:00:00.000Z",
      events: [{
        timestamp: "2026-09-26T00:30:00.000Z",
        message: "request failed with 500",
        logStreamName: "container-1",
      }],
      matchedEventsRead: 1,
      truncated: false,
    }),
  });

  const result = await evidenceNode(stateWithMessage(toolMessage));

  assert.ok(result.evidence);
  assert.equal(result.evidence.length, 2);
  assert.equal(result.evidence[0].type, "log_search");
  assert.equal(result.evidence[1].type, "log_event");
  assert.equal(result.evidence[1].resource, "/musebase_api/production/talent-service");
  assert.match(result.evidence[1].summary, /request failed with 500/);
});

test("empty CloudWatch search is recorded without inventing an error", async () => {
  const toolMessage = new ToolMessage({
    name: "search_logs",
    tool_call_id: "call-2",
    content: JSON.stringify({
      logGroupName: "/musebase_api/production/talent-service",
      startTime: "2026-09-26T00:00:00.000Z",
      endTime: "2026-09-26T01:00:00.000Z",
      events: [],
      matchedEventsRead: 0,
      truncated: false,
    }),
  });

  const result = await evidenceNode(stateWithMessage(toolMessage));

  assert.ok(result.evidence);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].type, "log_search");
  assert.match(result.evidence[0].summary, /0 events returned/);
});

test("common credentials are redacted before logs reach the agent", () => {
  assert.equal(
    redactLogMessage('Authorization: Bearer abc123 password="s3cret"'),
    'Authorization: [REDACTED] password="[REDACTED]"'
  );
});
