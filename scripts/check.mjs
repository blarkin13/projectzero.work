import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const required = ['portfolio-owner','portfolio-tracker-api','portfolio-brand-edge','projectzero-commercial','projectzero-guides'];
const manifest = JSON.parse(readFileSync('source-baseline.json', 'utf8'));
let failed = false;
for (const name of required) {
  const file = 'workers/'+name+'/worker.mjs';
  const data = readFileSync(file, 'utf8');
  const r = spawnSync(process.execPath, ['--check', file], {stdio:'inherit'});
  if (r.error || r.status !== 0) failed = true;
  if (/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}|\b(?:gh[pousr]_|github_pat_|ptk_)[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(data)) {
    console.error(name+': possible committed credential'); failed = true;
  }
  const hash = createHash('sha256').update(data).digest('hex');
  const baseline = manifest.workers[name]?.template_sha256;
  console.log(name+': '+hash+(hash === baseline?' (matches baseline)':' (changed from baseline)'));
}
if (failed) process.exitCode = 1;
