import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  githubProvider,
} from "../../integrations/github/github.provider.js";

export const listRepositories = tool(
  async () => {
    const repositories =
      await githubProvider.listRepositories();

    return JSON.stringify(
      repositories
    );
  },
  {
    name: "list_repositories",

    description: `
Discover GitHub repositories accessible through
the connected GitHub credential.

Use this tool when you need to determine which
repository may contain code relevant to an incident.

The returned repositories are already restricted
by the connected GitHub credential.
    `.trim(),

    schema: z.object({}),
  }
);
