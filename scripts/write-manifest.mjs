// Writes the PZ_BUILD_MANIFEST secret (raw JSON or base64 JSON) to a private file. Never prints it.
import { writeFileSync } from 'node:fs';
const out = process.argv[2], raw = (process.env.PZ_BUILD_MANIFEST || '').trim();
if (!out || !raw) { console.error('::error::PZ_BUILD_MANIFEST secret is missing'); process.exit(1); }
let text = raw;
if (!raw.startsWith('{')) { try { text = Buffer.from(raw, 'base64').toString('utf8'); } catch { text = ''; } }
let manifest;
try { manifest = JSON.parse(text); } catch { console.error('::error::PZ_BUILD_MANIFEST is not JSON or base64-encoded JSON'); process.exit(1); }
if (manifest?.schema !== 1 || !manifest.workers) { console.error('::error::PZ_BUILD_MANIFEST must use schema 1 with a workers object'); process.exit(1); }
writeFileSync(out, JSON.stringify(manifest), {mode: 0o600});
console.log('Manifest written for: '+Object.keys(manifest.workers).sort().join(', '));
