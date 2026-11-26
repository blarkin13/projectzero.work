# Customer onboarding and assistant connections

## Release status

The public landing page and demo are separate from the protected owner workspace. The demo is fictional, memory-only, and has no network connection to AI services or customer accounts. It generates deterministic, copy-ready example instructions, not AI output.

The commercial Worker is a separate tenant-scoped service, with only its dedicated commercial D1 binding. Keep CUSTOMER_ACCESS=disabled (or owner-only sign-in), workers.dev and previews disabled, and no customer-facing custom domain until the remaining identity, security, privacy, legal, billing and owner release gates pass. No live account creation, billing, AI service connection, scheduler or external service purchase is enabled by this release.

## Customer setup

With a valid commercial session, an active entitlement and owner/admin membership, open `/workspaces/:workspace_id/setup`. The form creates a saved brief and generates operating instructions automatically. Manual users need no assistant account. Advanced custom preferences are optional. The existing-project selector retrieves saved instructions. This is a foundation for the customer journey, not a public signup flow.

- POST `/api/v1/workspaces/:workspace_id/projects`: create a project and onboarding brief in a transaction with atomic project limits.
- GET `/api/v1/workspaces/:workspace_id/projects/:project_id/onboarding`: read the scoped brief and instructions.
- GET/POST `/api/v1/workspaces/:workspace_id/projects/:project_id/assistant-keys`: list metadata or explicitly create a single-provider read-only connection.
- DELETE `/api/v1/workspaces/:workspace_id/projects/:project_id/assistant-keys/:id`: revoke a connection.
- GET `/api/v1/assistant/project`: bearer authentication; reads only that key's project instructions and up to 50 scoped tasks.

Keys are random, hashed at rest, revealed once, valid for 30 days, limited to one active key per selected provider and 100 successful read requests/day. Only owner/admin can issue/revoke; membership, creator status, workspace entitlement, expiry and archival are checked. A key cannot edit tasks, access integrations/financials, or execute/schedule AI. A key is not a ChatGPT or Claude integration: verify the customer's assistant plan and supported secure connection mechanism before showing real connection instructions. Never paste keys into prompts. An explicit connection confirmation and provider-specific end-to-end work remain before launch. Customer deletion/retention, abuse protection for unauthenticated requests, identity provider and billing tests are still required.

## Release and rollback

The additive migration `schema/migrations/001-commercial-onboarding.sql` applies only to the separate commercial database. Do not modify the private tracker. Confirm it is the correct isolated binding, access remains disabled, and the old schema is healthy; apply the migration, verify table shapes and foreign-key integrity, and deploy the reviewed commercial module preserving existing settings. New installs run the baseline commercial schema followed by migrations in order. No live customer rows or keys are created during release. Retain the previous Worker version for rollback; the additive tables can remain in place.

The public landing module is now represented in `workers/projectzero-landing/worker.mjs`. Its public analytics site identifier is redacted as __PZ_PUBLIC_ANALYTICS_SITE__ in the repository. For release, preserve the real existing deployed identifier privately; never deploy the placeholder. Verify exact deployed baseline and apply reviewed changes to the existing binding-free landing Worker, preserving analytics consent and the private sign-in gate. The established five-Worker private recovery manifest is unchanged; a full landing manifest reconciliation is a separate release-maintenance task.

Run `npm run check` and `npm test`. Public demo route and asset version, CSP, instruction generation, auth/CSRF, workspace isolation, quota, hashing, expiration/revocation and rate limits are exercised with synthetic SQLite data. Before enabling commercial customer access, also complete authentic identity-provider session and cross-tenant HTTP tests against a nonproduction environment and verify the UI on desktop and mobile.
