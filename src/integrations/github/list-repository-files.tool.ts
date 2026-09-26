import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { githubProvider } from "./github.provider.js";

export const listRepositoryFiles = tool(
  async ({ repository, path, ref }) =>
    JSON.stringify(await githubProvider.listRepositoryFiles(repository, path, ref)),
  {
    name: "list_repository_files",
    description:
      "List files and directories at a path in an accessible GitHub repository. Start with the repository root, then inspect relevant directories and read files with get_file_content to understand project architecture.",
    schema: z.object({
      repository: z.string().describe("Full owner/repository name from list_repositories"),
      path: z.string().default("").describe("Directory path; empty string means repository root"),
      ref: z.string().optional().describe("Optional branch, tag, or commit SHA"),
    }),
  }
);
