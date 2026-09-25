import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  githubProvider,
} from "../../integrations/github/github.provider.js";


export const getCommit = tool(
  async ({
    repository,
    commitSha,
  }) => {
    const commit =
      await githubProvider.getCommit(
        repository,
        commitSha
      );

    return JSON.stringify(commit);
  },
  {
    name: "get_commit",

    description:
      "Inspect a specific commit from an accessible GitHub repository, including changed files and code patches.",

    schema: z.object({
      repository:
        z.string(),

      commitSha:
        z.string(),
    }),
  }
);