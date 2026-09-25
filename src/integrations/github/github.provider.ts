import { octokit } from "./client.js";

export interface GitHubRepository {
  id: number;
  fullName: string;
  description: string | null;
  private: boolean;
  language: string | null;
  defaultBranch: string;
  updatedAt: string | null;
}

export class GitHubProvider {
  async listRepositories(): Promise<
    GitHubRepository[]
  > {
    const repositories =
      await octokit.paginate(
        octokit.rest.repos
          .listForAuthenticatedUser,
        {
          per_page: 100,

          sort: "updated",

          direction: "desc",
        }
      );

    return repositories.map(
      (repo) => ({
        id: repo.id,

        fullName: repo.full_name,

        description:
          repo.description,

        private:
          repo.private,

        language:
          repo.language,

        defaultBranch:
          repo.default_branch,

        updatedAt:
          repo.updated_at,
      })
    );
  }

  async assertRepositoryAccess(
  repository: string
): Promise<void> {
  const repositories =
    await this.listRepositories();

  const accessible =
    repositories.some(
      (repo) =>
        repo.fullName === repository
    );

  if (!accessible) {
    throw new Error(
      `Repository is not accessible: ${repository}`
    );
  }
}
}

export const githubProvider =
  new GitHubProvider();