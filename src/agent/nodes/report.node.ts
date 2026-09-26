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
  const currentEvidence = state.evidence.slice(state.evidenceStartIndex);
  const evidenceText =
    currentEvidence
      .slice(-100)
      .map(
        (evidence, index) => `
Evidence ${index + 1}
ID: ${evidence.id}
Source: ${evidence.source}
Type: ${evidence.type}
Timestamp: ${evidence.timestamp ?? "unknown"}
Resource: ${evidence.resource ?? "unknown"}
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
For GitHub Actions, distinguish a successful workflow run from a
successful deployment step. A completed deployment step does not
prove the current EC2 container image or target environment.

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
${state.incidentId || "not provided"}

Environment:
${state.environment || "not provided"}

Service:
${state.service || "not provided"}

Collected Evidence:
${currentEvidence.length > 100 ? `Showing the latest 100 of ${currentEvidence.length} evidence items.` : ""}

${evidenceText}
      `),
  ]);

  return {
    messages: [response],
  };
}
