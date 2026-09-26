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
  async listRepositories(): Promise<GitHubRepository[]> {
    const repositories = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
      per_page: 100,

      sort: "updated",

      direction: "desc",
    });

    return repositories.map(repo => ({
      id: repo.id,

      fullName: repo.full_name,

      description: repo.description,

      private: repo.private,

      language: repo.language,

      defaultBranch: repo.default_branch,

      updatedAt: repo.updated_at,
    }));
  }

  async assertRepositoryAccess(repository: string): Promise<void> {
    const repositories = await this.listRepositories();

    const accessible = repositories.some(repo => repo.fullName === repository);

    if (!accessible) {
      throw new Error(`Repository is not accessible: ${repository}`);
    }
  }

  private parseRepository(repository: string) {
    const [owner, repo, ...rest] = repository.split("/");

    if (!owner || !repo || rest.length > 0) {
      throw new Error(`Invalid repository: ${repository}`);
    }

    return {
      owner,
      repo,
    };
  }

  async listRepositoryFiles(repository: string, path = "", ref?: string) {
    await this.assertRepositoryAccess(repository);
    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (!Array.isArray(data)) {
      throw new Error(`Path is not a directory: ${path || "/"}`);
    }

    return {
      repository,
      path: path || "/",
      ref: ref ?? null,
      entries: data.slice(0, 200).map(entry => ({
        path: entry.path,
        type: entry.type,
        size: entry.size,
      })),
      truncated: data.length > 200,
    };
  }

  async listWorkflows(repository: string, limit = 20, page = 1) {
    await this.assertRepositoryAccess(repository);
    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.actions.listRepoWorkflows({
      owner,
      repo,
      per_page: limit,
      page,
    });

    return {
      repository,
      page,
      workflows: data.workflows.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
      })),
      hasMore: data.total_count > page * limit,
    };
  }

  async listWorkflowRuns(repository: string, workflowId: number, limit = 20, page = 1) {
    await this.assertRepositoryAccess(repository);
    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
      per_page: limit,
      page,
    });

    return {
      repository,
      workflowId,
      page,
      runs: data.workflow_runs.map(run => ({
        id: run.id,
        runNumber: run.run_number,
        runAttempt: run.run_attempt,
        workflowName: run.name,
        workflowPath: run.path,
        event: run.event,
        branch: run.head_branch,
        commitSha: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        startedAt: run.run_started_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      })),
      hasMore: data.total_count > page * limit,
    };
  }

  async getWorkflowRunDetails(repository: string, runId: number) {
    await this.assertRepositoryAccess(repository);
    const { owner, repo } = this.parseRepository(repository);

    const [runResponse, jobsResponse] = await Promise.all([
      octokit.rest.actions.getWorkflowRun({ owner, repo, run_id: runId }),
      octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        filter: "latest",
        per_page: 100,
      }),
    ]);

    const run = runResponse.data;

    return {
      repository,
      runId: run.id,
      runNumber: run.run_number,
      runAttempt: run.run_attempt,
      workflowName: run.name,
      workflowPath: run.path,
      event: run.event,
      branch: run.head_branch,
      commitSha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      startedAt: run.run_started_at,
      updatedAt: run.updated_at,
      url: run.html_url,
      jobs: jobsResponse.data.jobs.map(job => ({
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        steps: (job.steps ?? []).map(step => ({
          name: step.name,
          status: step.status,
          conclusion: step.conclusion,
          startedAt: step.started_at,
          completedAt: step.completed_at,
        })),
      })),
      jobsTruncated: jobsResponse.data.total_count > jobsResponse.data.jobs.length,
    };
  }

  async listRecentCommits(repository: string, limit = 10) {
    await this.assertRepositoryAccess(repository);

    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: limit,
    });

    return data.map(commit => ({
      sha: commit.sha,

      message: commit.commit.message,

      author: commit.commit.author?.name,

      committedAt: commit.commit.author?.date,

      url: commit.html_url,
    }));
  }
  async getCommit(repository: string, commitSha: string) {
    await this.assertRepositoryAccess(repository);

    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: commitSha,
    });

    return {
      repository,

      sha: data.sha,

      message: data.commit.message,

      author: data.commit.author?.name,

      committedAt: data.commit.author?.date,

      stats: data.stats
        ? {
            additions: data.stats.additions,

            deletions: data.stats.deletions,

            total: data.stats.total,
          }
        : undefined,

      files:
        data.files?.map(file => ({
          filename: file.filename,

          status: file.status,

          additions: file.additions,

          deletions: file.deletions,

          changes: file.changes,

          patch: file.patch,
        })) ?? [],
    };
  }
  async getFileContent(repository: string, path: string, ref?: string) {
    await this.assertRepositoryAccess(repository);

    const { owner, repo } = this.parseRepository(repository);

    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data) || data.type !== "file") {
      throw new Error(`Path is not a file: ${path}`);
    }

    if (!("content" in data)) {
      throw new Error(`File content unavailable: ${path}`);
    }

    return {
      repository,
      path: data.path,
      sha: data.sha,

      content: Buffer.from(data.content, "base64").toString("utf8"),
    };
  }
}

export const githubProvider =
  new GitHubProvider();
