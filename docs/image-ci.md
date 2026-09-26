# Image publishing

The `Build and Publish Image` workflow runs on pushes to `main` and can also be
started manually from the main branch. It does not SSH to EC2, run Compose, or
trigger another repository's deployment.

Configure repository Actions secrets:

- `DOCKER_USERNAME`: the Docker Hub account/namespace, matching the backend CD.
- `DOCKER_PASSWORD`: a Docker Hub access token with permission to push this image.

Create the `musebase-ops-pilot` repository in that Docker Hub namespace and select
its intended public/private visibility. Secrets must be available to this GitHub
repository; secrets stored only in `veyra_api` are not inherited automatically.

After typecheck, build, and offline tests pass, CI builds a Linux amd64 API image
for the current x86 EC2 instance. It checks production module loading using dummy
tokens (no database, model or AWS requests) before publishing:

- `<DOCKER_USERNAME>/musebase-ops-pilot:latest`
- `<DOCKER_USERNAME>/musebase-ops-pilot:sha-<full-commit-sha>`

Every main push builds its own SHA image. Only `latest` promotion is serialized
and checks that the commit is still the main branch head; an older build that
finishes late cannot promote its image over the current main revision.

The image excludes `.env` files; runtime credentials are provided only during
deployment. No OpenAI/GitHub/database/AWS credentials are required by image CI.
The Docker Hub publishing token is the only external-service credential used.

Publishing an image does not update EC2. Later, add the image to `veyra_api`'s
Compose configuration and run its existing deployment workflow to pull it.
SHA tags identify a version for reproducible deployment/rollback; `latest` moves
with new main builds. Do not add a separate deployment stage here.
