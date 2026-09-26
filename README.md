# OpsPilot

OpsPilot is a LangGraph incident investigator. It discovers CloudWatch Log Groups in the configured AWS account and Region, searches relevant logs, inspects GitHub changes, and produces an evidence-based report.

## Local setup

1. Install dependencies with `pnpm install`.
2. Set `AWS_PROFILE` and `AWS_REGION` in your shell or local `.env`. The profile must already work with the AWS CLI. See `.env.example` for the other variables.
3. Grant the profile `logs:DescribeLogGroups` for discovery and `logs:FilterLogEvents` for the Log Groups it may read.
4. Run `pnpm start`.

The agent does not need a list of Log Groups. It discovers them using the profile, chooses groups relevant to the incident, and can follow clues across services. Searches default to the last 30 minutes and are limited to a 24-hour window, 50 returned events, and five CloudWatch result pages per call. The CLI example in `src/index.ts` currently uses a fixed incident and service; edit that input when investigating another incident.

Backend deployment history is not connected yet. GitHub access requires `GITHUB_TOKEN`.
