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
    intent: "incident",
    requestStartIndex: 0,
    evidenceStartIndex: 0,
    investigationSteps: 1,
    generalSteps: 0,
    maxGeneralSteps: 6,
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

function workflowRunMessage(event: string, deployConclusion: string): ToolMessage {
  return new ToolMessage({
    name: "inspect_github_workflow_run",
    tool_call_id: `run-${event}`,
    content: JSON.stringify({
      repository: "Hanoryx-North/veyra_api",
      runId: event === "push" ? 36150211956 : 35499433438,
      runNumber: event === "push" ? 107 : 105,
      runAttempt: 1,
      workflowName: "Build and Deploy",
      workflowPath: ".github/workflows/cicd.yml@main",
      event,
      branch: event === "push" ? "main" : "feature/test",
      commitSha: "cb097b880b59afbe4e0c2e2fcdabdc933a49bc1c",
      status: "completed",
      conclusion: "success",
      createdAt: "2026-09-25T14:50:49Z",
      updatedAt: "2026-09-25T14:54:11Z",
      url: "https://github.com/Hanoryx-North/veyra_api/actions/runs/36150211956",
      jobsTruncated: false,
      jobs: [{
        name: "build-and-deploy",
        conclusion: "success",
        steps: [{
          name: "Deploy to Remote Server",
          conclusion: deployConclusion,
          completedAt: "2026-09-25T14:54:08Z",
        }],
      }],
    }),
  });
}

test("successful deploy step creates deployment evidence at step completion time", async () => {
  const result = await evidenceNode(stateWithMessage(workflowRunMessage("push", "success")));

  assert.ok(result.evidence);
  assert.deepEqual(result.evidence.map(item => item.type), ["workflow_run", "deployment"]);
  assert.equal(result.evidence[1].timestamp, "2026-09-25T14:54:08Z");
  assert.match(result.evidence[1].summary, /not the current EC2 container state/);
});

test("successful PR build with skipped deploy step is not a deployment", async () => {
  const result = await evidenceNode(stateWithMessage(workflowRunMessage("pull_request", "skipped")));

  assert.ok(result.evidence);
  assert.deepEqual(result.evidence.map(item => item.type), ["workflow_run"]);
  assert.match(result.evidence[0].summary, /Deploy to Remote Server=skipped/);
});

test("workflow file evidence retains deployment targets for reporting", async () => {
  const toolMessage = new ToolMessage({
    name: "get_file_content",
    tool_call_id: "workflow-file",
    content: JSON.stringify({
      repository: "Hanoryx-North/veyra_api",
      path: ".github/workflows/cicd.yml",
      sha: "workflow-sha",
      content: "name: Build and Deploy\nif: github.event_name != 'pull_request'\ndocker build -t veyra-talent:latest .\ndocker compose up -d\n",
    }),
  });

  const result = await evidenceNode(stateWithMessage(toolMessage));

  assert.ok(result.evidence);
  assert.match(result.evidence[0].summary, /veyra-talent/);
  assert.match(result.evidence[0].summary, /docker compose up -d/);
});
