import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

import type {
  OpsPilotStateType,
} from "../state.js";

import type {
  Evidence,
} from "../evidence.js";

const logSearchResultSchema = z.object({
  logGroupName: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  query: z.string().optional(),
  events: z.array(z.object({
    timestamp: z.string(),
    message: z.string(),
    logStreamName: z.string().optional(),
  })),
  matchedEventsRead: z.number(),
  truncated: z.boolean(),
});

const workflowRunSchema = z.object({
  repository: z.string(),
  runId: z.number(),
  runNumber: z.number(),
  runAttempt: z.number(),
  workflowName: z.string().nullable(),
  workflowPath: z.string(),
  event: z.string(),
  branch: z.string().nullable(),
  commitSha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  jobsTruncated: z.boolean(),
  jobs: z.array(z.object({
    name: z.string(),
    conclusion: z.string().nullable(),
    steps: z.array(z.object({
      name: z.string(),
      conclusion: z.string().nullable(),
      completedAt: z.string().nullable().optional(),
    })),
  })),
});

function isDeploymentStep(name: string): boolean {
  return /^(deploy|publish|release)\b/i.test(name.trim());
}

const evidenceToolNames =
  new Set([
    "search_logs",
    "inspect_github_workflow_run",
    "get_commit",
    "get_file_content",
  ]);

function getLatestToolMessages(
  messages: OpsPilotStateType["messages"]
): ToolMessage[] {
  const toolMessages: ToolMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    if (!(message instanceof ToolMessage)) {
      break;
    }

    toolMessages.unshift(message);
  }

  return toolMessages;
}

function parseToolContent(
  message: ToolMessage
): unknown {
  if (typeof message.content !== "string") {
    return message.content;
  }

  try {
    return JSON.parse(message.content);
  } catch {
    return message.content;
  }
}

function toolMessageToEvidence(
  message: ToolMessage
): Evidence | Evidence[] | null {
  const data = parseToolContent(message);

  switch (message.name) {
    case "search_logs": {
      const parsed = logSearchResultSchema.safeParse(data);
      if (!parsed.success) {
        return null;
      }

      const result = parsed.data;
      const searchEvidence: Evidence = {
        id: crypto.randomUUID(),
        source: "logs",
        type: "log_search",
        resource: result.logGroupName,
        summary: `Searched ${result.logGroupName} from ${result.startTime} to ${result.endTime}${result.query ? ` for "${result.query}"` : ""}; ${result.events.length} events returned${result.truncated ? " (scan truncated)" : ""}.`,
        rawData: {
          query: result.query,
          startTime: result.startTime,
          endTime: result.endTime,
          matchedEventsRead: result.matchedEventsRead,
          truncated: result.truncated,
        },
      };

      return [searchEvidence, ...result.events.map(event => ({
        id: crypto.randomUUID(),
        source: "logs" as const,
        type: "log_event" as const,
        timestamp: event.timestamp,
        resource: result.logGroupName,
        summary: event.message.slice(0, 500),
        rawData: {
          logStreamName: event.logStreamName,
          message: event.message,
          query: result.query,
          truncated: result.truncated,
        },
      }))];
    }

    case "inspect_github_workflow_run": {
      const parsed = workflowRunSchema.safeParse(data);
      if (!parsed.success) {
        return null;
      }

      const run = parsed.data;
      const deploySteps = run.jobs.flatMap(job =>
        job.steps
          .filter(step => isDeploymentStep(step.name))
          .map(step => ({ job: job.name, ...step }))
      );

      const runEvidence: Evidence = {
        id: crypto.randomUUID(),
        source: "github",
        type: "workflow_run",
        timestamp: run.updatedAt,
        resource: run.repository,
        summary:
          `GitHub Actions "${run.workflowName ?? "unknown workflow"}" run #${run.runNumber} ` +
          `(attempt ${run.runAttempt}, event ${run.event}, branch ${run.branch ?? "unknown"}) ` +
          `finished with ${run.conclusion ?? run.status} for commit ${run.commitSha}. ` +
          `Deployment steps: ${deploySteps.length > 0
            ? deploySteps.map(step => `${step.name}=${step.conclusion ?? "pending"}`).join(", ")
            : "none identified"}. ${run.jobsTruncated ? "Job list was truncated. " : ""}` +
          `Run: ${run.url}`,
        rawData: {
          runId: run.runId,
          workflowPath: run.workflowPath,
          event: run.event,
          branch: run.branch,
          commitSha: run.commitSha,
          createdAt: run.createdAt,
          conclusion: run.conclusion,
          jobsTruncated: run.jobsTruncated,
        },
      };

      const deploymentEvidence: Evidence[] = deploySteps
        .filter(step => step.conclusion === "success" || step.conclusion === "failure")
        .map(step => ({
          id: crypto.randomUUID(),
          source: "github",
          type: step.conclusion === "success" ? "deployment" : "deployment_attempt",
          timestamp: step.completedAt ?? run.updatedAt,
          resource: run.repository,
          summary:
            `GitHub Actions ${step.name} step ${step.conclusion} in job ${step.job} ` +
            `for commit ${run.commitSha} (${run.event}, ${run.branch ?? "unknown branch"}). ` +
            `This records the Actions step result, not the current EC2 container state. Run: ${run.url}`,
          rawData: {
            runId: run.runId,
            runAttempt: run.runAttempt,
            workflowName: run.workflowName,
            workflowPath: run.workflowPath,
            stepName: step.name,
            stepConclusion: step.conclusion,
            targetEnvironment: "unverified",
            commitSha: run.commitSha,
          },
        }));

      return [runEvidence, ...deploymentEvidence];
    }

case "get_commit": {
  if (
    typeof data !== "object" ||
    data === null ||
    !("sha" in data)
  ) {
    return null;
  }

  const commit = data as {
    repository: string;
    sha: string;
    message: string;
    author?: string;
    committedAt?: string;
    files?: Array<{
      filename: string;
      status: string;
      patch?: string;
    }>;
  };

  const title =
    commit.message
      ?.split("\n")[0] ??
    "Unknown commit";

  const changedFiles =
    commit.files
      ?.map(file => file.filename)
      .join(", ") ??
    "unknown files";

  return {
    id: crypto.randomUUID(),
    source: "github",
    type: "code_change",
    timestamp: commit.committedAt,
    resource: commit.repository,

    summary:
      `Commit ${commit.sha}: "${title}". ` +
      `Changed files: ${changedFiles}.`,

    rawData: commit,
  };
}

    case "get_file_content": {
      const file = data as {
        repository?: string;
        path?: string;
        sha?: string;
        content?: string;
      };

      const workflowExcerpt = file.path?.startsWith(".github/workflows/")
        ? file.content
          ?.split("\n")
          .filter(line => /\bdocker (?:build|push|compose)\b|\benvironment\s*:|\bif\s*:|\bname\s*:|\bdeploy to\b/i.test(line))
          .join("\n")
          .slice(0, 2_000)
        : undefined;

      return {
        id: crypto.randomUUID(),

        source: "github",

        type: "source_code",

        resource: file.repository,

        summary:
          `Source file ${file.path ?? "unknown"} ` +
          `was inspected from repository ` +
          `${file.repository ?? "unknown"}.` +
          (workflowExcerpt ? ` Relevant workflow lines:\n${workflowExcerpt}` : ""),

        rawData: data,
      };
    }
    default:
      throw new Error(`Unsupported evidence tool: ${message.name}`);
  }
}

export async function evidenceNode(
  state: OpsPilotStateType
) {
  const toolMessages =
    getLatestToolMessages(state.messages);

  if (toolMessages.length === 0) {
    return {};
  }

  const evidence = toolMessages
    .filter(message => evidenceToolNames.has(message.name ?? ""))
    .map(toolMessageToEvidence)
    .flatMap(item => item === null ? [] : Array.isArray(item) ? item : [item]);

  return {
    evidence,
  };
}
