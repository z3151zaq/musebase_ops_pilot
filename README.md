# OpsPilot

OpsPilot is a LangGraph incident investigator. It discovers CloudWatch Log Groups in the configured AWS account and Region, searches relevant logs, inspects GitHub Actions runs and code changes, and produces an evidence-based report.

## Local setup

1. Install dependencies with `pnpm install`.
2. Set `AWS_PROFILE` and `AWS_REGION` in your shell or local `.env`. The profile must already work with the AWS CLI. See `.env.example` for the other variables.
3. Grant the profile `logs:DescribeLogGroups` for discovery and `logs:FilterLogEvents` for the Log Groups it may read.
4. Run `pnpm start` for an interactive conversation. Enter a question and press Return; use `/clear` for a new conversation or `/exit` to quit. You can also ask one question with `pnpm start "How is Musebase structured?"`.

The agent classifies each request. Architecture, code, changes, and deployment questions use GitHub read-only tools and produce a direct answer. It can browse repository directories to locate architecture documentation and source files. An explicit bug or incident report uses the incident investigation graph and may query CloudWatch. When the request is unclear, it follows the general path. No incident ID, service, or environment is required for a general question.

For incident investigations, the agent discovers CloudWatch Log Groups using the AWS identity, chooses groups relevant to the incident, and can follow clues across services. Searches default to the last 30 minutes and are limited to a 24-hour window, 50 returned events, and five CloudWatch result pages per call.

GitHub access requires `GITHUB_TOKEN` with read access to the relevant repositories and GitHub Actions. The agent discovers workflows and checks jobs and steps before counting a run as a deployment. A successful deployment step confirms the Actions step completed; it does not prove which image is currently running on EC2. Workflows without an explicit GitHub environment do not establish whether their target was production.
