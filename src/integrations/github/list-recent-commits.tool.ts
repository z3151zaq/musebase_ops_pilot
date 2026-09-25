import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  githubProvider,
} from "../../integrations/github/github.provider.js";

export const listRecentCommits = tool(
  async ({
    repository,
    limit,
  }) => {
    const commits =
      await githubProvider.listRecentCommits(
        repository,
        limit
      );

    return JSON.stringify(commits);
  },
  {
    name: "list_recent_commits",

    description:
      "List recent commits from an accessible GitHub repository. Use this when investigating whether recent code changes correlate with an incident.",

    schema: z.object({
      repository: z
        .string()
        .describe(
          "Full repository name returned by list_repositories, e.g. company/backend"
        ),

      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10),
    }),
  }
);