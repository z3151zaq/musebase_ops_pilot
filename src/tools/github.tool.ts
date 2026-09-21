import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getCommit = tool(
  async ({ commitSha }) => {
    console.log(`🐙 Fetching GitHub commit: ${commitSha}`);

    const commits: Record<string, unknown> = {
      a81d92f: {
        sha: "a81d92f",
        pullRequest: 382,
        title: "Refactor order validation",
        author: "Alice",
        filesChanged: ["src/services/OrderService.ts"],
        changes: [
          "Moved customer_id validation",
          "Updated order validation schema",
        ],
      },
    };

    return JSON.stringify(
      commits[commitSha] ?? {
        error: "Commit not found",
      }
    );
  },
  {
    name: "get_commit",
    description:
      "Get details about a Git commit, including related pull request, changed files and code changes. Use this when investigating whether a deployment introduced an incident.",
    schema: z.object({
      commitSha: z.string().describe("Git commit SHA"),
    }),
  }
);