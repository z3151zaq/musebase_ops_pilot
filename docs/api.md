# OpsPilot API

Run `pnpm start:api` (default port 8080). CLI remains `pnpm start`.
Set `IDENTITY_ME_URL` to a trusted, fixed Identity endpoint. In Compose use
`http://identity:8080/api/auth/me`; for local integration use the existing HTTPS gateway endpoint.
Do not put database or GitHub credentials in Admin.

Every `/api/*` request forwards its original Bearer token to Identity. There is no
separate Cognito verifier or authentication cache. Only a valid `/me` response
with `role=admin` and `status=active` is accepted. The trusted user ID and nullable
agency ID determine session ownership; caller-provided user IDs are never used.
Local CLI sessions remain separate. Identity errors fail closed (401/403/503).

| Method | Internal path | Description |
| --- | --- | --- |
| GET | `/health` | Public process health; DB initialization completes before listening |
| POST | `/api/sessions` | Create an owned session |
| GET | `/api/sessions` | List the latest 20 owned sessions |
| GET | `/api/sessions/:id/messages` | Read owned session history |
| POST | `/api/sessions/:id/messages` | Body: `{ "message": "Your question" }`; SSE response |

Ordinary API results use `{success:true,data:...}`. Missing and foreign sessions
both return 404. Errors use `{success:false,data:null,msg:...}`.
SSE events are `progress` (`{step}`), `answer` (`{text}`, Markdown), `done`
(`{sessionId}`), or `error` (`{message}`). The answer is currently delivered as
one final event, not token-by-token. Progress contains node/tool names, never
hidden reasoning or raw tool arguments. A heartbeat runs every 15 seconds.
Use authenticated POST `fetch` streaming in Admin; its JSON-only request helper
cannot parse this response. Do not blindly retry a stream after it has started.

Runs have a five-minute budget and cancel on disconnect. PostgreSQL advisory
locks prevent simultaneous runs for the same session across CLI/API instances;
each process permits at most two runs. Use a session-mode PostgreSQL connection
(Supabase pooler port 5432), not transaction-mode pooling, for those locks.
Requests are limited to 60/minute per direct peer IP. Behind YARP this is a shared
gateway limit; add authenticated per-user throttling at the gateway before wider
rollout rather than trusting arbitrary forwarded-IP headers.

## YARP integration (configuration proposal; not applied)

Add an `ops-pilot` cluster pointing at `http://ops-pilot:8080`. Route
`/ops-pilot/{**catch-all}` to it with `AuthorizationPolicy: "Admin"` and a
`PathPattern: "/{**catch-all}"` transform. Admin then uses
`https://api.musebase.net/ops-pilot/api/sessions` and related paths.
Set cluster `HttpRequest.ActivityTimeout` to `00:02:00` and
`HttpRequest.AllowResponseBuffering` to `false`. Ensure any outer proxy supports
streaming too. The API has no direct browser CORS policy: browser requests should
pass through the existing gateway CORS policy.

Build the image with `docker build -t musebase-ops-pilot .`. Add the `ops-pilot`
service to the existing Compose network with only `expose: ["8080"]`, not public
port mapping. Supply PG variables, OPENAI_API_KEY, GITHUB_TOKEN, AWS_REGION and
IDENTITY_ME_URL through server-side environment/secrets; use the EC2 role for AWS.
Existing deployment overwrites `.env` and uses `--remove-orphans`, so coordinate
the Compose/env changes with the backend CD before deploying this container.
YARP/Compose/Admin repositories and live deployments have not been modified.

Checkpoint data includes code and logs. Restrict database access and retention.
Configure trusted database CA verification before production rather than relying
on `PGSSL_REJECT_UNAUTHORIZED=false`.
