import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const input = process.argv[2];
if (!input) throw Error('Usage: npm run build -- /secure/local/manifest.json');
const manifest = JSON.parse(readFileSync(input,'utf8'));
if (manifest.schema !== 1 || !manifest.workers) throw Error('Invalid private manifest');
const names = ['portfolio-owner','portfolio-tracker-api','portfolio-brand-edge','projectzero-commercial','projectzero-guides'];
const sha = s => createHash('sha256').update(s).digest('hex');
const outputs = [];
for (const name of names) {
  const entry = manifest.workers[name];
  if (!entry || !entry.metadata || !entry.replacements) throw Error('Missing private configuration: '+name);
  const template = readFileSync('workers/'+name+'/worker.mjs','utf8');
  let source = template;
  for (const [key,value] of Object.entries(entry.replacements)) {
    if (!/^__PZ_CONFIG_\d{3}__$/.test(key) || typeof value !== 'string') throw Error('Invalid configuration mapping');
    source = source.split(key).join(value);
  }
  if (/__PZ_CONFIG_\d{3}__/.test(source)) throw Error('Unresolved configuration in '+name);
  const unchanged = sha(template) === entry.template_sha256;
  if (unchanged && sha(source) !== entry.source_sha256) throw Error('Baseline round-trip mismatch: '+name);
  const dir = 'dist/'+name;
  mkdirSync(dir,{recursive:true});
  writeFileSync(dir+'/worker.mjs',source,{mode:0o600});
  const check = spawnSync(process.execPath,['--check',dir+'/worker.mjs'],{stdio:'inherit'});
  if(check.status !== 0 || check.error) throw Error('Syntax check failed: '+name);
  const metadata = {...entry.metadata, main_module:'worker.js'};
  // This specific internal service is a code-owned dependency, not a secret.
  // Pin it so stale private manifests cannot omit the MCP tracker bridge.
  if (name==='portfolio-owner') {
    const binding={name:'TRACKER_API',type:'service',service:'portfolio-tracker-api'};
    const existing=(metadata.bindings||[]).find(b=>b.name===binding.name);
    if(existing&&(existing.type!==binding.type||existing.service!==binding.service))throw Error('Unexpected TRACKER_API binding target');
    metadata.bindings=[...(metadata.bindings||[]).filter(b=>b.name!==binding.name),binding];
  }
  if (metadata.bindings?.some(x=>x.type==='secret_text')) throw Error('Secret values must not be embedded in build metadata');
  if (name==='projectzero-commercial' && metadata.bindings?.some(x=>x.name==='CUSTOMER_ACCESS' && x.text!=='disabled')) throw Error('Commercial customer access must remain disabled');
  writeFileSync(dir+'/metadata.json',JSON.stringify(metadata,null,2),{mode:0o600});
  writeFileSync(dir+'/schedules.json',JSON.stringify(entry.schedules||[],null,2),{mode:0o600});
  outputs.push({worker:name,sha256:sha(source),matches_deployed_baseline:unchanged});
}
console.log(JSON.stringify(outputs,null,2));
console.log('Build only. No live deployment performed.');
