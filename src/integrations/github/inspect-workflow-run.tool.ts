import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { githubProvider } from "./github.provider.js";

export const inspectWorkflowRun = tool(
  async ({ repository, runId }) =>
    JSON.stringify(await githubProvider.getWorkflowRunDetails(repository, runId)),
  {
    name: "inspect_github_workflow_run",
    description:
      "Inspect the latest attempt of a GitHub Actions run, including job and step conclusions and completion times. Use this to determine whether an actual deployment step succeeded or was skipped/failed.",
    schema: z.object({
      repository: z.string().describe("Full owner/repository name from list_repositories"),
      runId: z.number().int().positive(),
    }),
  }
);
