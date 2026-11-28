# Project Zero remote MCP

The owner Worker serves a private, stateless Streamable HTTP MCP endpoint at
`https://dash.projectzero.work/mcp`. Supported handshake-era protocol revisions
are 2025-11-25, 2025-06-18 and 2025-03-26. The endpoint supports initialize,
notifications, ping, tools, resources and prompts over JSON-RPC. It does not
implement the newer 2026-era protocol, legacy SSE transport or OAuth discovery.
Clients must support a custom Authorization header. No browser cookies or
query-string credentials are accepted.

## Connect an assistant
1. Sign in to the dashboard as the owner and open Development → integration,
   or Chamber of Secrets → MCP integration.
2. Create a separate private tracker key for each assistant (shown once).
3. At /integrations/mcp, grant specific capabilities to the key and confirm.
   A key without grants cannot use MCP. Unchecking all scopes disables MCP;
   revoking or expiring the underlying key disables both the tracker API and MCP.
4. Configure a Streamable HTTP MCP client with the above URL and
   `Authorization: Bearer <private-assistant-key>`. Store the key in the client's
   secret store, not its source, shared prompts or a public configuration.

For a client accepting a server URL and custom HTTP headers, use the URL and
header above. OAuth-only clients (including hosted connector interfaces that
do not accept custom headers) require a separate OAuth integration; this release
does not claim compatibility with those interfaces.

## Capabilities

| Scope | Tools |
|---|---|
| tracker.read | get_instructions, list_projects, list_tasks, get_task, list_owner_actions, get_owner_action |
| tracker.write | update_task, update_owner_action |
| chamber.read | chamber_status (owner credential metadata only) |
| deploy.preflight | release_preflight |
| deploy.write | release_deploy, release_rollback |
| stripe.refresh | refresh_stripe_reports (private aggregate snapshots, status only) |

Tracker calls use the original authenticated tracker API, including revision
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

Apply additive migration `schema/migrations/007-mcp-grants.sql` to the
portfolio-owner PORTFOLIO binding, then release only the portfolio-owner Worker
through the existing approved release procedure. Do not change other Workers,
routes, bindings or schedules. Verify the UI, anonymous 401, scoped discovery,
revocation, and one read-only authorized call before enabling write scopes.
