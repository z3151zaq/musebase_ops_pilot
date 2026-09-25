import "dotenv/config";

import {
  githubProvider,
} from "./integrations/github/github.provider.js";

const repositories =
  await githubProvider.listRepositories();

console.log(
  JSON.stringify(
    repositories,
    null,
    2
  )
);