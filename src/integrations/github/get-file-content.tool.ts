import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  githubProvider,
} from "../../integrations/github/github.provider.js";


export const getFileContent = tool(
  async ({
    repository,
    path,
    ref,
  }) => {
    const file =
      await githubProvider.getFileContent(
        repository,
        path,
        ref
      );

    return JSON.stringify(file);
  },
  {
    name: "get_file_content",

    description:
      "Read a source file from an accessible GitHub repository. Use this when code context is required to understand a suspicious change.",

    schema: z.object({
      repository:
        z.string(),

      path:
        z.string(),

      ref:
        z.string().optional(),
    }),
  }
);