# projectzero.work
Project Zero is a centralized business management platform for digital entrepreneurs, combining financial reporting, development tracking, AI coordination, infrastructure monitoring, and business lifecycle management in a unified executive workspace.

## Development workflow

The five deployed Cloudflare Workers are reconciled under `workers/`. The public source templates exclude production-only resource identifiers and credentials; private configuration is applied only in an authorized build environment.

- Node.js 22 or newer: `npm run check`, `npm test`.
- Feature branches and pull requests run GitHub Actions source checks.
- Build deployable modules using the authorized private configuration manifest: `npm run build -- /secure/local/manifest.json`.
- See [release procedure](docs/RELEASE.md) for preflight, deployment verification, and rollback. Merging a PR does not deploy to production.
