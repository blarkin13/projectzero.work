# Native owner Stripe balance snapshots

The portfolio-owner Worker runs read-only Stripe balance synchronization on the hour (UTC), using its **existing** 15-minute cron trigger. No new cron, paid service, or payment configuration is needed. The owner-only Finance → Sources page has a same-origin POST **Refresh now** action, current snapshot coverage, and credential configuration status. The public commercial/customer workspace does not use these owner accounts.

## Private connection setup

The connector's OAuth authorization is not exported to the Worker. Store these four connections in Project Zero’s owner-only **Chamber of Secrets** at /secrets. No new Cloudflare secret bindings are needed: the existing VAULT_MASTER_KEY encrypts the Chamber. Never commit values, put them in the public build manifest, or send them through chat.

| Chamber secret name | Project (choose in the Chamber) | Exact authorized live Stripe account name |
|---|---|---|
| PZ_STRIPE_APT_READ | SiteAPT | siteAPT |
| PZ_STRIPE_HUM_READ | Humperdinck | humperdinck.studio |
| PZ_STRIPE_YARR_READ | Yarr | YARR.MEDIA |
| PZ_STRIPE_OWL_READ | The Story Owl | theStoryOwl |

Choose Kind **Stripe key** and the matching project. Existing owner Chamber entries with the exact reserved names under Shared systems are also accepted; no credential re-entry is needed. For each account, verify its live identity and immutable account ID in Stripe's dashboard. Create a separate restricted live key with only read access required for GET /v1/account and GET /v1/balance_transactions. Do not reuse checkout, webhook, full-access, or test keys. The value is a JSON object with fields account_id and api_key (the matching verified account ID and restricted key). The Worker refuses missing/test/full-access credentials, duplicate account pins, and account-ID mismatches before listing transactions. Existing business payment credentials remain unchanged. If the account identity endpoint is not accessible using the narrowly scoped key, the connection remains incomplete rather than using an alternate account. The corresponding Chamber secret can be rotated or revoked; no legacy Worker secret fallback bypasses revocation. Chamber credential usage is audited with name and purpose, never values.

## Snapshot semantics

Only the private BRAND_FILES R2 binding is used for financial data writes, at finance/stripe-balance-v1/YYYY-MM.json. The established schema/source label is retained for compatibility. All data is filtered to a fixed UTC cutoff; during UTC days 1–3 the previous month ends at the current month's exact start. The Worker reads at most 5 pages of 100 records per account, newest first. It stores only currency/reporting-category aggregates in integer minor units. Missing credentials, invalid data, repeated IDs or incomplete pages produce incomplete account records with no totals; if all four fail, retain the prior snapshot. Conditional R2 writes prevent racing updates and older/equal cutoffs cannot overwrite a newer report. Readback is validated and compared. Logs contain only status, never payment details, transaction IDs, Stripe responses or secrets.

## Release and cutover

Follow docs/RELEASE.md for portfolio-owner only. Verify the protected Sources page and manual refresh, check all four account coverage statuses and private R2 readback, then confirm a scheduled hourly refresh. Keep the existing ChatGPT schedule until native coverage is verified; disable that fallback only after verification. No manual accounting records or monthly_finance changes are part of this integration.
