# Project Zero remote MCP

The owner Worker serves a private, stateless Streamable HTTP MCP endpoint at
`https://dash.projectzero.work/mcp`. Supported handshake-era protocol revisions
are 2025-11-25, 2025-06-18 and 2025-03-26. The endpoint supports initialize,
notifications, ping, tools, resources and prompts over JSON-RPC. It does not
implement the newer 2026-era protocol, legacy SSE transport. OAuth discovery and authorization-code + PKCE are provided for ChatGPT. MCP requests require an OAuth access token or a dedicated bearer token; browser cookies and query-string credentials are not accepted by the resource endpoint.

## Connect ChatGPT through OAuth

1. In ChatGPT, open Settings → Plugins → Add custom MCP server.
2. Name it Project.Zero.Work, enter `https://dash.projectzero.work/mcp`, and choose **OAuth**. Do not select no authentication.
3. Sign in with your existing Project Zero owner Google account, review permissions (read-only by default) and approve. No token needs to be pasted.
4. Review or revoke the resulting connection in the [MCP manager](https://dash.projectzero.work/integrations/mcp). Actual tool availability also depends on the ChatGPT account/workspace and client.

The OAuth server uses registered ChatGPT HTTPS callbacks, S256 PKCE, a one-time authorization code, resource binding, owner-only consent, one-hour access tokens and rotating refresh tokens. Connection grants expire after 90 days and are revocable immediately. Other OAuth clients require reviewed callback support; no public/customer connection is enabled.

## Connect a custom-header client
1. Sign in to the dashboard as the owner and open [MCP integration](https://dash.projectzero.work/integrations/mcp).
2. Choose **Add connection**, enter a name and select the assistant and permissions. Read-only access is selected by default.
3. Create the connection and save its MCP-only token (shown once). The token has no direct tracker API or agent deployment access. Its backing tracker key is encrypted internally and never displayed.
4. Configure a Streamable HTTP MCP client with the server URL and
   `Authorization: Bearer <private-MCP-token>`. Store the token in the client's secret store, not its source, shared prompts or a public configuration.
5. Use the connection manager to review last use, change permissions, disable all scopes, or revoke the connection. Revocation also revokes the backing tracker key. Tokens expire after 90 days.

Legacy tracker keys can be managed in the collapsed Existing tracker keys section; those keys retain their original direct API privileges. Prefer dedicated MCP-only connections for new clients.

For a client accepting a server URL and custom HTTP headers, use the URL and
header above. Use the OAuth setup above for the hosted ChatGPT interface. Hosted Claude OAuth is not yet verified or enabled.

## Capabilities

| Scope | Tools |
|---|---|
| tracker.read | get_instructions, list_projects, list_tasks, get_task, list_owner_actions, get_owner_action |
| tracker.write | update_task, update_owner_action |
| chamber.read | chamber_status (owner credential metadata only) |
| deploy.preflight | release_preflight |
| deploy.write | release_deploy, release_rollback |
| stripe.refresh | refresh_stripe_reports (private aggregate snapshots, status only) |

Dedicated MCP-only tokens are hashed, and their backing tracker tokens are encrypted with the Chamber master key. Tracker calls use the original authenticated tracker API, including revision
checks and audit trail. The underlying tracker key retains its existing direct
API permissions; MCP grants govern the new endpoint only. Existing direct agent
deployment permissions are unchanged. Deployment still checks merge ancestry,
CI, live source drift, existing bindings, cron configuration and release locks.
A deployment grant is powerful; enable it only for an assistant authorized to
release software, and require owner approval for each actual deployment.
The confirmation argument is intentional acknowledgment, not an independent
owner approval mechanism. A successful preflight does not deploy.

No MCP tool extracts or returns a plaintext credential, sends it to an arbitrary
host, reveals ciphertext or the encryption key, exposes arbitrary SQL, or
permits direct changes to the Chamber. Secrets are used only by existing audited
server-side providers. Additional provider operations need reviewed, constrained
tools. There are no generic endpoint, header or command execution tools.

MCP requires active owner grants, a valid unexpired bearer, an allowed Origin
(if present), bounded JSON, schema-validated parameters and a per-key request
limit. The owner permission screen uses existing dashboard authentication
and same-origin protections. Chamber access fails closed if audit storage fails.

## Release

Apply additive migrations `schema/migrations/007-mcp-grants.sql` and `schema/migrations/008-mcp-connections.sql` and `schema/migrations/009-mcp-oauth.sql` to the
portfolio-owner PORTFOLIO binding, then release only the portfolio-owner Worker
through the existing approved release procedure. Do not change other Workers,
routes, bindings or schedules. Verify the UI, anonymous 401, scoped discovery,
revocation, and one read-only authorized call before enabling write scopes.
