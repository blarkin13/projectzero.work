import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha = s => createHash('sha256').update(s).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
const digest = value => sha(JSON.stringify(canonical(value)));
const sorted = a => [...a].sort();
export function configDigest(entry) {
  const metadata = entry.metadata;
  if (!metadata || !Array.isArray(metadata.bindings) || !Array.isArray(entry.required_secret_names) || !Array.isArray(entry.schedules)) throw Error('Incomplete configuration observation');
  if (metadata.bindings.some(b => b.type === 'secret_text')) throw Error('Secret values are not permitted in metadata');
  return digest({metadata:{...metadata,bindings:[...metadata.bindings].sort((a,b)=>a.name.localeCompare(b.name))},required_secret_names:sorted(entry.required_secret_names),schedules:sorted(entry.schedules)});
}

export function verifyRelease({name,entry,observed,template,candidate,now=Date.now()}) {
  if (!entry || !observed) throw Error('Missing baseline or current observation');
  if (!/^[a-f0-9]{64}$/.test(entry.source_sha256) || !/^[a-f0-9]{64}$/.test(entry.template_sha256)) throw Error('Invalid baseline hashes');
  const age = now-Date.parse(observed.observed_at);
  if (!Number.isFinite(age) || age<0 || age>15*60*1000) throw Error('Live observation must be less than 15 minutes old');
  if (observed.worker!==name || !observed.deployment_id || !Array.isArray(observed.versions) || observed.versions.length!==1 || observed.versions[0].percentage!==100 || !observed.versions[0].version_id) throw Error('Expected one known active version at 100%');
  if (observed.source_sha256!==entry.source_sha256) throw Error('Production source drift: reconcile before releasing');
  if (observed.configuration_sha256!==configDigest(entry)) throw Error('Production configuration drift: reconcile before releasing');
  let restored=template;
  for (const [key,value] of Object.entries(entry.replacements||{})) {
    if (!/^__PZ_CONFIG_\d{3}__$/.test(key) || typeof value!=='string') throw Error('Invalid configuration mapping');
    restored=restored.split(key).join(value);
  }
  if (/__PZ_CONFIG_\d{3}__/.test(restored) || restored!==candidate) throw Error('Candidate does not match reviewed source and private configuration');
  if (sha(template)===entry.template_sha256 && sha(candidate)!==entry.source_sha256) throw Error('Unchanged baseline must reproduce deployed source exactly');
  if (name==='projectzero-commercial') {
    const bindings=entry.metadata.bindings, find=n=>bindings.find(b=>b.name===n);
    const access=find('CUSTOMER_ACCESS')?.text;
    if (access!=='disabled') {
      const betaNames=['COMMERCIAL_DB','CUSTOMER_ACCESS','EMAIL_LOGIN_MODE','TURNSTILE_SITE_KEY','BETA_EMAIL','BETA_AUTH_LIMIT','OWNER_EMAIL','GOOGLE_LOGIN_MODE'];
      const email=find('BETA_EMAIL'), rate=find('BETA_AUTH_LIMIT');
      const beta=access==='beta'&&bindings.length===betaNames.length&&betaNames.every(n=>!!find(n))&&
        find('COMMERCIAL_DB').type==='d1'&&find('EMAIL_LOGIN_MODE').text==='invite_only'&&find('GOOGLE_LOGIN_MODE').text==='owner_beta'&&find('OWNER_EMAIL').type==='plain_text'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(find('OWNER_EMAIL').text||'')&&
        /^[A-Za-z0-9_-]{10,100}$/.test(find('TURNSTILE_SITE_KEY').text||'')&&
        email.type==='send_email'&&JSON.stringify(email.allowed_sender_addresses)===JSON.stringify(['signin@auth.projectzero.work'])&&
        rate.type==='ratelimit'&&rate.simple?.limit===12&&rate.simple?.period===60&&
        JSON.stringify(sorted(entry.required_secret_names))===JSON.stringify(sorted(['TURNSTILE_SECRET','PZW_GOOGLE_CLIENT_ID','PZW_GOOGLE_CLIENT_SECRET','GOOGLE_OAUTH_STATE_KEY']));
      if (!beta) throw Error('Commercial customer access must remain disabled except the explicitly isolated free beta configuration');
    }
  }
  return {worker:name,previous_version:observed.versions[0].version_id,previous_deployment:observed.deployment_id,source_sha256:sha(candidate),configuration_sha256:configDigest(entry),change:sha(candidate)===entry.source_sha256?'no-op':'source change',status:'preflight passed; no deployment performed'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [manifestPath,observationPath,name]=process.argv.slice(2);
  const names=['portfolio-owner','portfolio-tracker-api','portfolio-brand-edge','projectzero-commercial','projectzero-guides'];
  if (!manifestPath||!observationPath||!names.includes(name)) throw Error('Usage: npm run preflight -- /secure/manifest.json /secure/observation.json WORKER');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const observation=JSON.parse(readFileSync(observationPath,'utf8'));
  if(manifest.schema!==1 || observation.schema!==1) throw Error('Unsupported manifest or observation');
  const template=readFileSync('workers/'+name+'/worker.mjs','utf8');
  const candidate=readFileSync('dist/'+name+'/worker.mjs','utf8');
  console.log(JSON.stringify(verifyRelease({name,entry:manifest.workers[name],observed:observation.workers[name],template,candidate}),null,2));
}

