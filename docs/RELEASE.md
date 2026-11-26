# Release procedure

This repository contains the reconciled Worker modules. The live private deployment has not been switched to GitHub or altered by the import. Production resource identifiers, private endpoint configuration, credentials, and records must not be committed.

## Development

1. Read the live tracker and inspect open branches/pull requests.
2. Work on a feature branch. Run `npm run check` and `npm test` with Node 22 or newer.
3. Use synthetic fixtures and isolated development resources. Do not use production credentials in a test environment.
4. Review the diff and CI result before merging.

## Build

The authorized owner maintains a private recovery manifest containing original hashes, replacement mappings, existing non-secret deployment metadata, required secret binding names, and schedules. Obtain it through the authorized private storage interface, save it outside the repository or under ignored `local/`, and restrict file access.

Run `npm run build -- /secure/local/manifest.json`. It produces restored Worker modules and their metadata under ignored `dist/`. An unchanged baseline must reproduce its original SHA-256 digest exactly. Changed modules are identified by their new hash. Review those changes before release.

## Production

Use an approved Cloudflare deployment identity with scoped permissions. Verify the current deployed version, configuration, secret binding names, routes, schedules and exact source against the release baseline immediately before deployment. If anything changed, reconcile first. Back up current source and configuration to private storage. Upload only the selected reviewed module with its existing metadata, preserving secret bindings and deployment settings. Do not change unrelated Workers, routes, schedules, D1 schemas or commercial access.

Validate the protected dashboard while authenticated, check anonymous access rejection, public demo and guides, and affected integration data. For a failed release use Cloudflare's supported version rollback to the recorded prior version, then reverify. Do not roll back a database migration without its separate recovery plan.

CI only runs source checks. Production deployment is deliberately not automatic. The private build manifest and deployment credentials are not GitHub artifacts. No customer data, live database export or production secrets should be included in a release.
