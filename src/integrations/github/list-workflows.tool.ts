import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { githubProvider } from "./github.provider.js";

export const listWorkflows = tool(
  async ({ repository, limit, page }) =>
    JSON.stringify(await githubProvider.listWorkflows(repository, limit, page)),
  {
    name: "list_github_workflows",
    description:
      "List GitHub Actions workflows in an accessible repository. Discover the repository first, then identify workflows that may deploy the affected service. Use page + 1 when hasMore is true.",
    schema: z.object({
      repository: z.string().describe("Full owner/repository name from list_repositories"),
      limit: z.number().int().min(1).max(50).default(20),
      page: z.number().int().min(1).max(20).default(1),
    }),
  }
);
