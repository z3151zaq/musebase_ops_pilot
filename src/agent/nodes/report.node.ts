import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

import type { OpsPilotStateType } from "../state.js";

const reportModel = new ChatOpenAI({
  model: "gpt-5.6-luna",
  useResponsesApi: true,
});

export async function reportNode(
  state: OpsPilotStateType
) {
  console.log("\n📝 Generating incident report...");
  const evidenceText =
    state.evidence
      .map(
        (evidence, index) => `
Evidence ${index + 1}
ID: ${evidence.id}
Source: ${evidence.source}
Type: ${evidence.type}
Timestamp: ${evidence.timestamp ?? "unknown"}
Summary: ${evidence.summary}
`
      )
      .join("\n");

  const response = await reportModel.invoke([
    new SystemMessage(`
You are the reporting component of OpsPilot.

Your job is to produce a concise incident investigation report
using ONLY the evidence gathered during the investigation.

Do not invent facts.

If the evidence is insufficient, explicitly say so.

Separate observed facts from hypotheses.

Return the report using this structure:

# Incident Report

## Summary

## Impact

## Evidence

## Likely Root Cause

## Confidence

Confidence must be one of:
- Low
- Medium
- High

## Recommended Next Steps
    `),
    new HumanMessage(`
Incident ID:
${state.incidentId}

Environment:
${state.environment}

Service:
${state.service}

Collected Evidence:

${evidenceText}
      `),
  ]);

  return {
    messages: [response],
  };
}