// Gated Cloudflare Worker release for GitHub Actions (.github/workflows/deploy.yml).
// Never prints credentials or the private manifest. Fails closed on any drift.
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const WORKERS = ['portfolio-owner','portfolio-tracker-api','portfolio-brand-edge','projectzero-commercial','projectzero-guides'];
const sha = s => createHash('sha256').update(s).digest('hex');
const SECRET_TYPES = ['secret_text','secret_key'];
export class ReleaseError extends Error {}

export function restore(template, replacements) {
  let out = template;
  for (const [k,v] of Object.entries(replacements||{})) {
    if (!/^__PZ_CONFIG_\d{3}__$/.test(k) || typeof v !== 'string') throw new ReleaseError('Invalid manifest replacement');
    out = out.split(k).join(v);
  }
  if (/__PZ_CONFIG_\d{3}__/.test(out)) throw new ReleaseError('Unresolved configuration placeholder');
  return out;
}

// Recover each placeholder's value from live source built from this template. Returns null unless
// every placeholder has one consistent value and rebuilding reproduces the live source exactly.
export function deriveReplacements(template, live) {
  const parts = template.split(/(__PZ_CONFIG_\d{3}__)/);
  if (!live.startsWith(parts[0])) return null;
  let budget = 100000;
  const solve = (i, pos, values) => {
    if (--budget < 0) return null;
    if (i >= parts.length) return pos === live.length ? values : null;
    const key = parts[i], lit = parts[i+1], last = i+2 >= parts.length;
    if (key in values) {
      const v = values[key];
      if (!live.startsWith(v+lit, pos)) return null;
      if (last && pos+v.length+lit.length !== live.length) return null;
      return solve(i+2, pos+v.length+lit.length, values);
    }
    if (last) { if (!live.endsWith(lit) || live.length-lit.length < pos) return null; return solve(i+2, live.length, {...values, [key]: live.slice(pos, live.length-lit.length)}); }
    for (let at = live.indexOf(lit, pos); at >= 0; at = live.indexOf(lit, at+1)) {
      const out = solve(i+2, at+lit.length, {...values, [key]: live.slice(pos, at)});
      if (out) return out;
      if (budget < 0) return null;
    }
    return null;
  };
  const values = solve(1, parts[0].length, {});
  if (!values) return null;
  try { return restore(template, values) === live ? values : null; } catch { return null; }
}

// Only additive, idempotent statements may be applied automatically.
export function parseMigration(text) {
  const header = text.match(/^--\s*D1 binding:\s*([a-z0-9-]+)\/([A-Z0-9_]+)\s*$/m);
  if (!header) throw new ReleaseError('Migration needs a "-- D1 binding: worker/BINDING" header');
  const sql = text.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  if (!statements.length) throw new ReleaseError('Migration is empty');
  for (const s of statements) if (!/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s/i.test(s)) throw new ReleaseError('Only CREATE TABLE/INDEX IF NOT EXISTS statements can be applied automatically');
  return {worker: header[1], binding: header[2], sql: statements.join(';\n')+';', statements: statements.length};
}

const bindingSet = list => JSON.stringify((list||[]).filter(b => !SECRET_TYPES.includes(b.type)).map(b => b.name+':'+b.type).sort());
const crons = list => JSON.stringify((list||[]).map(s => typeof s === 'string' ? s : s.cron).sort());

export function cloudflare({token, account, fetchImpl = fetch}) {
  const base = 'https://api.cloudflare.com/client/v4/accounts/'+account;
  const call = async (path, init = {}) => {
    const r = await fetchImpl(base+path, {...init, headers: {Authorization: 'Bearer '+token, ...(init.headers||{})}});
    if (path.endsWith('/content/v2')) {
      if (!r.ok) throw new ReleaseError('Cloudflare content request failed ('+r.status+')');
      const type = r.headers.get('content-type') || '';
      if (type.includes('multipart/form-data')) {
        const form = await r.formData();
        const files = [...form.entries()].filter(([,v]) => typeof v !== 'string');
        if (files.length !== 1) throw new ReleaseError('Live Worker is not a single module; reconcile manually');
        return files[0][1].text();
      }
      return r.text();
    }
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok || !j?.success) throw new ReleaseError('Cloudflare '+(init.method||'GET')+' '+path.replace(/^\/[^/]+\/[^/]+\//,'')+' failed ('+r.status+(j?.errors?.[0]?.message ? ': '+String(j.errors[0].message).slice(0,200) : '')+')');
    return j.result;
  };
  return {call};
}

export async function release(opts, deps = {}) {
  const {worker, mode, manifest, metadata, commit, versionId, migration, vaultKey, runId, template} = opts;
  let {candidate} = opts;
  const log = deps.log || (() => {});
  const gitShow = deps.gitShow || ((rev, path) => execFileSync('git', ['show', rev+':'+path], {encoding: 'utf8', maxBuffer: 20e6}));
  const gitLog = deps.gitLog || (path => execFileSync('git', ['log', '--format=%H', '-n', '30', 'HEAD', '--', path], {encoding: 'utf8'}).split('\n').filter(Boolean));
  if (!WORKERS.includes(worker)) throw new ReleaseError('Unknown worker');
  if (!['preflight','deploy','rollback'].includes(mode)) throw new ReleaseError('Mode must be preflight, deploy or rollback');
  const entry = manifest?.workers?.[worker];
  if (manifest?.schema !== 1 || !entry?.metadata || !entry.replacements) throw new ReleaseError('Build manifest has no complete entry for '+worker);
  const cf = cloudflare({token: deps.token, account: deps.account, fetchImpl: deps.fetch});
  const s = '/workers/scripts/'+worker;

  const [source, settings, schedules, deployments] = await Promise.all([cf.call(s+'/content/v2'), cf.call(s+'/settings'), cf.call(s+'/schedules'), cf.call(s+'/deployments')]);
  const dep = deployments?.deployments?.[0];
  if (!dep || dep.versions?.length !== 1 || dep.versions[0].percentage !== 100) throw new ReleaseError('Expected one active version at 100%; finish or roll back the gradual deployment first');
  const liveVersion = dep.versions[0].version_id, liveSha = sha(source);

  if (mode === 'rollback') {
    if (!/^[0-9a-f-]{36}$/.test(versionId||'')) throw new ReleaseError('version_id is required for rollback');
    await cf.call(s+'/versions/'+versionId);
    await cf.call(s+'/deployments', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({strategy: 'percentage', versions: [{percentage: 100, version_id: versionId}], annotations: {'workers/message': 'Rollback via GitHub Actions'+(runId ? ' run '+runId : '')}})});
    return {worker, mode, previous_version: liveVersion, active_version: versionId, status: 'rolled back; verify live now'};
  }

  // Baseline: the live version is tagged with the commit it was built from; rebuild that commit and
  // require an exact match. Untagged (pre-workflow) releases must match the manifest's recorded hash.
  const detail = await cf.call(s+'/versions/'+liveVersion);
  const tag = detail?.annotations?.['workers/tag'] || detail?.metadata?.annotations?.['workers/tag'] || '';
  // A commit matches when its build with the manifest values is byte-identical to live, or when live is
  // exactly that commit with different configuration values (a stale manifest). In the second case the
  // live values are kept so a release never silently reverts production configuration.
  const path = 'workers/'+worker+'/worker.mjs';
  const matchCommit = rev => {
    let tpl; try { tpl = gitShow(rev, path); } catch { return null; }
    try { if (sha(restore(tpl, entry.replacements)) === liveSha) return {replacements: entry.replacements, drift: []}; } catch {}
    // Live is the commit's unconfigured template (deployed without the manifest): the release restores configuration.
    if (sha(tpl) === liveSha) return {replacements: entry.replacements, drift: [], unconfigured: [...new Set(tpl.match(/__PZ_CONFIG_\d{3}__/g)||[])].length};
    const derived = deriveReplacements(tpl, source);
    if (!derived) return null;
    return {replacements: {...entry.replacements, ...derived}, drift: Object.keys(derived).filter(k => derived[k] !== entry.replacements[k]).sort()};
  };
  let baseline, config = {replacements: entry.replacements, drift: []};
  if (/^[0-9a-f]{40}$/.test(tag)) {
    const m = matchCommit(tag);
    if (!m) throw new ReleaseError('Production source differs from its tagged commit '+tag.slice(0,12)+'; reconcile before releasing');
    baseline = 'tagged commit '+tag.slice(0,12); config = m;
  } else if (liveSha === entry.source_sha256) {
    baseline = 'manifest source_sha256';
  } else {
    // Untagged release made outside this workflow: accept it only if it is exactly a recent commit.
    let match = null, m = null;
    for (const rev of gitLog(path)) { m = matchCommit(rev); if (m) { match = rev; break; } }
    if (!match) throw new ReleaseError('Production source ('+liveSha.slice(0,12)+') matches none of the last 30 commits of '+path+', even allowing for configuration values; reconcile before releasing');
    baseline = 'untagged; matches commit '+match.slice(0,12); config = m;
  }
  if (config.drift.length && !config.unconfigured) {
    if (!template) throw new ReleaseError('Configuration drift requires the current template to rebuild the candidate');
    candidate = restore(template, config.replacements);
  }
  if (bindingSet(settings?.bindings) !== bindingSet(metadata.bindings)) throw new ReleaseError('Production bindings differ from the release manifest; reconcile before releasing');
  const liveSecrets = new Set((settings?.bindings||[]).filter(b => SECRET_TYPES.includes(b.type)).map(b => b.name));
  const missing = (entry.required_secret_names||[]).filter(n => !liveSecrets.has(n));
  if (missing.length) throw new ReleaseError('Production is missing required secrets: '+missing.join(', '));
  if (crons(schedules?.schedules) !== crons(entry.schedules)) throw new ReleaseError('Production cron schedules differ from the release manifest; reconcile before releasing');

  let mig = null;
  if (migration) {
    mig = parseMigration(migration.text);
    if (mig.worker !== worker) throw new ReleaseError('Migration targets '+mig.worker+', not '+worker);
    const b = (settings?.bindings||[]).find(x => x.name === mig.binding && x.type === 'd1');
    if (!b?.id) throw new ReleaseError('Live Worker has no D1 binding named '+mig.binding);
    mig.database_id = b.id; mig.file = migration.file;
  }
  const addVault = worker === 'portfolio-owner' && !!vaultKey && !liveSecrets.has('VAULT_MASTER_KEY');
  if (vaultKey && !/^[A-Za-z0-9+/]{43}=$/.test(vaultKey)) throw new ReleaseError('VAULT_MASTER_KEY must be 32 bytes in base64 (openssl rand -base64 32)');
  const candidateSha = sha(candidate);
  const plan = {worker, mode, commit, baseline, previous_version: liveVersion, live_source_sha256: liveSha, candidate_sha256: candidateSha, change: candidateSha === liveSha ? 'no-op' : 'source change', migration: mig ? mig.file+' ('+mig.statements+' statements → '+mig.binding+')' : 'none', unconfigured_live: config.unconfigured ? 'production is running '+config.unconfigured+' unfilled __PZ_CONFIG__ placeholders; this release restores them from PZ_BUILD_MANIFEST' : 'no', config_drift: config.drift.length ? config.drift.join(', ')+' differ from PZ_BUILD_MANIFEST; live values kept — update the manifest' : 'none', vault_master_key: worker !== 'portfolio-owner' ? 'n/a' : liveSecrets.has('VAULT_MASTER_KEY') ? 'already set (never overwritten)' : vaultKey ? 'will be set' : 'not provided'};
  log(plan);
  if (mode === 'preflight') return {...plan, status: 'preflight passed; nothing changed'};

  if (mig) { await cf.call('/d1/database/'+mig.database_id+'/query', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({sql: mig.sql})}); log({migration_applied: mig.file}); }
  if (plan.change === 'no-op' && !addVault) return {...plan, status: 'no-op; already live'+(mig ? ' (migration applied)' : '')};

  const bindings = (metadata.bindings||[]).filter(b => !SECRET_TYPES.includes(b.type));
  if (addVault) bindings.push({type: 'secret_text', name: 'VAULT_MASTER_KEY', text: vaultKey});
  const upload = {...metadata, main_module: 'worker.js', bindings, keep_bindings: SECRET_TYPES, annotations: {'workers/tag': commit, 'workers/message': 'GitHub Actions release'+(runId ? ' run '+runId : '')}};
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(upload)], {type: 'application/json'}));
  form.append('worker.js', new Blob([candidate], {type: 'application/javascript+module'}), 'worker.js');
  await cf.call(s, {method: 'PUT', body: form});
  const after = await cf.call(s+'/deployments');
  const newVersion = after?.deployments?.[0]?.versions?.[0]?.version_id || '';
  const liveAfter = sha(await cf.call(s+'/content/v2'));
  if (liveAfter !== candidateSha) throw new ReleaseError('Uploaded, but live source hash does not match the candidate. Roll back to '+liveVersion+' and investigate.');
  return {...plan, new_version: newVersion, rollback_version: liveVersion, vault_master_key: addVault ? 'set' : plan.vault_master_key, status: 'deployed; verify live now'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = n => { const i = process.argv.indexOf('--'+n); return i > 0 ? process.argv[i+1] : ''; };
  const summary = x => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```json\n'+JSON.stringify(x, null, 2)+'\n```\n'); };
  try {
    const worker = process.env.WORKER, mode = process.env.MODE, file = (process.env.MIGRATION||'').trim();
    if (!process.env.CLOUDFLARE_API_TOKEN || !/^[0-9a-f]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID||'')) throw new ReleaseError('CLOUDFLARE_API_TOKEN and a 32-character CLOUDFLARE_ACCOUNT_ID are required');
    if (file && !/^schema\/migrations\/\d{3}-[a-z0-9-]+\.sql$/.test(file)) throw new ReleaseError('Migration must be a file under schema/migrations/');
    if (!WORKERS.includes(worker)) throw new ReleaseError('Unknown worker');
    const manifest = JSON.parse(readFileSync(arg('manifest'), 'utf8'));
    const result = await release({worker, mode, manifest, candidate: mode === 'rollback' ? '' : readFileSync('dist/'+worker+'/worker.mjs', 'utf8'), metadata: mode === 'rollback' ? {} : JSON.parse(readFileSync('dist/'+worker+'/metadata.json', 'utf8')), template: readFileSync('workers/'+worker+'/worker.mjs', 'utf8'), commit: process.env.GITHUB_SHA, versionId: (process.env.VERSION_ID||'').trim(), migration: file ? {file, text: readFileSync(file, 'utf8')} : null, vaultKey: (process.env.VAULT_MASTER_KEY||'').trim(), runId: process.env.GITHUB_RUN_ID}, {token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID, log: x => console.log(JSON.stringify(x, null, 2))});
    console.log(JSON.stringify(result, null, 2)); summary(result);
  } catch (e) {
    const msg = e instanceof ReleaseError ? e.message : 'Release failed: '+String(e?.message||e).slice(0,300);
    console.error('::error::'+msg); summary({status: 'refused', error: msg}); process.exitCode = 1;
  }
}
