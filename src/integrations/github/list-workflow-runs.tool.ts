import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { githubProvider } from "./github.provider.js";

export const listWorkflowRuns = tool(
  async ({ repository, workflowId, limit, page }) =>
    JSON.stringify(await githubProvider.listWorkflowRuns(repository, workflowId, limit, page)),
  {
    name: "list_github_workflow_runs",
    description:
      "List recent runs of a discovered GitHub Actions workflow. A successful run may only be a build; inspect its jobs and steps before treating it as deployment evidence. Use page + 1 when hasMore is true.",
    schema: z.object({
      repository: z.string().describe("Full owner/repository name from list_repositories"),
      workflowId: z.number().int().positive(),
      limit: z.number().int().min(1).max(50).default(20),
      page: z.number().int().min(1).max(20).default(1),
    }),
  }
);
