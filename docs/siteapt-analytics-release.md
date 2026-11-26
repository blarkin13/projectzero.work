# PZ-09 private analytics candidate

This branch is a source-only candidate. It does not enable customer access, add credentials, create services, modify a database, trigger another project's schedule, or deploy any Worker.

## Reporting contract

- Exact root/www mappings for the active portfolio registry, plus an explicitly approved guide hostname.
- Owner-role membership matching the existing configured owner identity and a verified site record are both required. An ambiguous duplicate verified hostname is suppressed.
- All SiteAPT traffic, performance and integration freshness aggregates use the same scope. No visitor-level records, membership details, or private identifiers are returned.
- 7/30/90 inclusive UTC calendar days through today, with tomorrow excluded; missing daily records remain unavailable, not zero. Today can be incomplete. Performance snapshots are counted, not converted into inferred scores.
- Story Owl's independent collector is separately labeled and only queried for its active business or the all-business view.
- Unknown selections, absent registry, unavailable sources and missing owner configuration fail closed for SiteAPT.

## Validation before any authorized release

1. Verify the production SiteAPT archival model; the inspected schema exposed no archive-status column in the sites table. Active portfolio filtering and exact hostname matching exclude inactive portfolio projects and unexpected archived hostnames, but must not be represented as proof that every possible archive representation is excluded.
2. Review owner membership, verification semantics, exact hostname mappings and date formats against the current SiteAPT application contract. Do not read unrelated customers' records to validate.
3. Run the repository checks and synthetic regression tests. Compare candidate to the exact deployed recovery baseline; preserve baseline hashes until an actual verified release.
4. Obtain a permitted release path. Do not retry or circumvent a previously blocked production deployment.
5. After authorized release, verify the authenticated private dashboard and integration center, date filters, per-project coverage, no-data and source-unavailable states, negative isolation, and rollback readiness. Do not mark PZ-09 Done until verified.

No production analytics values were read to develop or test this branch.
