import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import account from '../workers/projectzero-commercial/worker.mjs';
import dash,{stripeRefresh} from '../workers/portfolio-owner/worker.mjs';
const A='https://account.projectzero.work',D='https://dash.projectzero.work';
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const sha=v=>createHash('sha256').update(v).digest('hex');
function d1(sql){
 const wrap=(q,a=[])=>{const p=sql.prepare(q);return {first:async()=>p.get(...a)||null,run:async()=>{const r=p.run(...a);return {success:true,meta:{changes:Number(r.changes)}}},all:async()=>({results:p.all(...a)})}};
 return {prepare(q){return {...wrap(q),bind(...a){return wrap(q,a)}}},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
}
async function setup(){
 const auth=new DatabaseSync(':memory:');auth.exec(readFileSync('schema/commercial.sql','utf8'));auth.exec(readFileSync('schema/migrations/004-owner-dashboard-auth.sql','utf8'));
 const authDb=d1(auth),session=token(),now=Math.floor(Date.now()/1000);
 auth.prepare("INSERT INTO users(id,oidc_subject,email) VALUES('u','subject','owner@gmail.com')").run();
 auth.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,'u',?)").run(sha(session),now+3600);
 const ae={COMMERCIAL_DB:authDb,CUSTOMER_ACCESS:'enabled',GOOGLE_LOGIN_MODE:'owner_only',OWNER_EMAIL:'owner@gmail.com',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_OAUTH_STATE_KEY:token(),AUTH_RATE_LIMIT:{limit:async()=>({success:true})}};
 const markup=await (await account.fetch(new Request(A+'/auth/dashboard',{headers:{cookie:'__Host-pz_session='+session}}),ae)).text();
 const code=markup.match(/name="code" value="([a-zA-Z0-9_-]{43})"/)[1];
 const bridge=await dash.fetch(new Request(D+'/auth/bridge',{method:'POST',headers:{origin:A,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code})}),{ACCOUNT_AUTH_DB:authDb,OWNER_EMAIL:'owner@gmail.com'},{});
 const cookie=bridge.headers.getSetCookie()[0].split(';')[0];
 const state=new DatabaseSync(':memory:');state.exec(readFileSync('schema/owner-state.sql','utf8'));
 const tracker=new DatabaseSync(':memory:');tracker.exec("CREATE TABLE tracker_api_keys(id TEXT PRIMARY KEY, actor TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT)");
 const agentKey='ptk_'+'a1'.repeat(32);tracker.prepare("INSERT INTO tracker_api_keys VALUES('k1','Claude',?,'2026-01-01',?,NULL)").run(sha(agentKey),new Date(Date.now()+86400000).toISOString());
 const env={ACCOUNT_AUTH_DB:authDb,OWNER_EMAIL:'owner@gmail.com',PORTFOLIO:d1(state),TRACKER:d1(tracker),VAULT_MASTER_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 env.__cookie=cookie;
 const get=async path=>{const r=await dash.fetch(new Request(D+path,{headers:{cookie,accept:'text/html'}}),env,{});return {status:r.status,text:await r.text()}};
 const post=(path,fields,origin=D)=>dash.fetch(new Request(D+path,{method:'POST',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}),env,{});
 const agent=(body,key=agentKey)=>dash.fetch(new Request(D+'/api/agent/deploy',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body)}),env,{});
 return {env,state,tracker,get,post,agent,agentKey};
}
const CF_TOKEN='cfut_'+'Z9'.repeat(20),ACCOUNT='0123456789abcdef0123456789abcdef';
test('Chamber stores encrypted secrets with audit, rotation, revocation and owner-only access',async()=>{
 const {env,state,get,post}=await setup();
 let page=await get('/secrets');assert.equal(page.status,200);assert.match(page.text,/Agent deploy readiness/);assert.match(page.text,/Missing<\/span><span><code>cloudflare-deploy-token/);
 assert.equal((await dash.fetch(new Request(D+'/secrets',{headers:{accept:'application/json'}}),env,{})).status,403);
 const add={name:'cloudflare-deploy-token',kind:'cloudflare-token',project:'Shared systems',value:CF_TOKEN,confirm:'yes'};
 assert.equal((await post('/secrets/create',add,'https://evil.example')).status,403);
 let r=await post('/secrets/create',add);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/secrets?notice=created');
 const row=state.prepare('SELECT * FROM vault_secrets').get();
 assert.equal(row.workspace_id,'owner');assert.equal(row.hint,'…Z9Z9');assert.ok(!row.ciphertext.includes(CF_TOKEN)&&!Buffer.from(row.ciphertext,'base64').toString('latin1').includes(CF_TOKEN));
 page=await get('/secrets?notice=created');assert.ok(!page.text.includes(CF_TOKEN));assert.match(page.text,/Secret stored and encrypted/);assert.match(page.text,/Stored<\/span><span><code>cloudflare-deploy-token/);
 assert.equal((await post('/secrets/create',add)).status,409);
 assert.equal((await post('/secrets/create',{...add,kind:'other'})).status,400);
 assert.equal((await post('/secrets/create',{...add,name:'acct',kind:'cloudflare-account',value:'not-an-id'})).status,400);
 assert.equal((await post('/secrets/create',{...add,name:'manifest-x',kind:'build-manifest',value:'{"schema":1,"workers":{"x":{"bindings":[{"type":"secret_text","text":"v"}]}}}'})).status,400);
 // Other workspaces are never shown in the owner Chamber.
 state.prepare("INSERT INTO vault_secrets(id,workspace_id,name,project,kind,ciphertext,iv,hint,bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('00000000-0000-4000-8000-000000000001','tenant-7','tenant-stripe','','stripe-key','x','y','',1,'t','t');
 assert.doesNotMatch((await get('/secrets')).text,/tenant-stripe/);
 // Rotation requires the current revision.
 assert.equal((await post('/secrets/rotate',{id:row.id,revision:'7',value:CF_TOKEN+'X'})).status,409);
 r=await post('/secrets/rotate',{id:row.id,revision:'1',value:'cfut_'+'Q8'.repeat(20)});assert.equal(r.status,303);
 const rotated=state.prepare('SELECT revision,hint,ciphertext FROM vault_secrets WHERE id=?').get(row.id);assert.equal(rotated.revision,2);assert.equal(rotated.hint,'…Q8Q8');assert.notEqual(rotated.ciphertext,row.ciphertext);
 // Revocation requires the typed name and deletes the stored value.
 assert.equal((await post('/secrets/revoke',{id:row.id,revision:'2',confirm_name:'wrong'})).status,400);
 r=await post('/secrets/revoke',{id:row.id,revision:'2',confirm_name:'cloudflare-deploy-token'});assert.equal(r.status,303);
 assert.deepEqual({...state.prepare('SELECT status,ciphertext,iv,hint FROM vault_secrets WHERE id=?').get(row.id)},{status:'Revoked',ciphertext:'',iv:'',hint:''});
 assert.deepEqual(state.prepare("SELECT action FROM vault_audit WHERE workspace_id='owner' ORDER BY id").all().map(x=>x.action),['Created','Rotated','Revoked']);
 // The name can be reused after revocation; a locked Chamber refuses writes and says why.
 assert.equal((await post('/secrets/create',add)).status,303);
 const key=env.VAULT_MASTER_KEY;delete env.VAULT_MASTER_KEY;
 assert.equal((await post('/secrets/create',{...add,name:'other-key'})).status,503);assert.match((await get('/secrets')).text,/Chamber is locked/);
 env.VAULT_MASTER_KEY=key;
});
test('agent deploy action enforces merge, checks and drift gates and never exposes secrets',async()=>{
 const {env,state,tracker,post,agent,agentKey}=await setup();
 const template=readFileSync('workers/portfolio-owner/worker.mjs','utf8');
 const placeholders=[...new Set(template.match(/__PZ_CONFIG_\d{3}__/g))];
 const replacements=Object.fromEntries(placeholders.map((k,i)=>[k,'https://cfg'+i+'.example']));
 let live='// previously deployed source';
 const manifest={schema:1,workers:{'portfolio-owner':{metadata:{main_module:'worker.js',compatibility_date:'2026-01-01',bindings:[{name:'PORTFOLIO',type:'d1',id:'db-id'}]},replacements,required_secret_names:['VAULT_MASTER_KEY'],schedules:['*/15 * * * *'],source_sha256:sha(live),template_sha256:'0'.repeat(64)}}};
 for(const [name,kind,value] of [['CLOUDFLARE_API_TOKEN','cloudflare-token',CF_TOKEN],['CLOUDFLARE_ACCOUNT_ID','cloudflare-account',ACCOUNT],['PZ_BUILD_MANIFEST','build-manifest',JSON.stringify(manifest)]])assert.equal((await post('/secrets/create',{name,kind,project:'Shared systems',value,confirm:'yes'})).status,303);
 assert.match((await (await dash.fetch(new Request(D+'/secrets',{headers:{cookie:env.__cookie,accept:'text/html'}}),env,{})).text()),/Stored<\/span><span><code>CLOUDFLARE_API_TOKEN/);
 const commit='c'.repeat(40);let compare='ahead',conclusion='success',version='v-old',tag='',uploads=[];const seen=[];
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{const url=String(input?.url||input),method=init.method||'GET';seen.push(method+' '+url);const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
  if(url.startsWith('https://api.cloudflare.com/'))assert.equal(init.headers.Authorization,'Bearer '+CF_TOKEN);
  if(url===`https://api.github.com/repos/blarkin13/projectzero.work/compare/${commit}...main`)return json({status:compare});
  if(url.startsWith(`https://api.github.com/repos/blarkin13/projectzero.work/commits/${commit}/check-runs`))return json({check_runs:[{status:'completed',conclusion}]});
  if(url===`https://raw.githubusercontent.com/blarkin13/projectzero.work/${commit}/workers/portfolio-owner/worker.mjs`)return new Response(template);
  const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/portfolio-owner`;
  if(url===base+'/content/v2')return new Response(live,{headers:{'content-type':'application/javascript+module'}});
  if(url===base+'/settings')return json({success:true,result:{bindings:[{name:'PORTFOLIO',type:'d1'},{name:'ACCOUNT_AUTH_DB',type:'d1',id:'auth-db'},{name:'VAULT_MASTER_KEY',type:'secret_text'}]}});
  if(url===base+'/schedules')return json({success:true,result:{schedules:[{cron:'*/15 * * * *'}]}});
  if(url.startsWith(base+'/versions/'))return json({success:true,result:{id:url.split('/').pop(),annotations:tag?{'workers/tag':tag}:{}}});
  if(url===base+'/deployments'&&method==='GET')return json({success:true,result:{deployments:[{id:'dep',versions:[{version_id:version,percentage:100}]}]}});
  if(url===base&&method==='PUT'){const form=init.body;uploads.push({metadata:JSON.parse(await form.get('metadata').text()),source:await form.get('worker.js').text()});live=uploads.at(-1).source;version='v-new';tag=uploads.at(-1).metadata.annotations['workers/tag'];return json({success:true,result:{id:'portfolio-owner'}})}
  throw Error('Unexpected fetch '+method+' '+url)};
 try{
  assert.equal((await agent({worker:'portfolio-owner',commit,mode:'deploy'},'ptk_'+'0'.repeat(64))).status,401);
  assert.equal((await agent({worker:'evil-worker',commit,mode:'deploy'})).status,400);
  let r=await agent({worker:'portfolio-owner',commit,mode:'preflight'});let body=await r.json();
  assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.change,'source change');assert.equal(body.previous_version,'v-old');assert.equal(uploads.length,0);
  r=await agent({worker:'portfolio-owner',commit,mode:'deploy'});body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
  assert.equal(body.new_version,'v-new');assert.deepEqual(body.rollback,{mode:'rollback',worker:'portfolio-owner',version_id:'v-old'});assert.equal(body.baseline,'manifest source_sha256');assert.equal(uploads[0].metadata.annotations['workers/tag'],commit);
  assert.equal(uploads.length,1);assert.deepEqual(uploads[0].metadata.keep_bindings,['secret_text','secret_key']);assert.ok(uploads[0].metadata.bindings.every(b=>b.type!=='secret_text'));assert.deepEqual(uploads[0].metadata.bindings.find(b=>b.name==='ACCOUNT_AUTH_DB'),{name:'ACCOUNT_AUTH_DB',type:'d1',id:'auth-db'});assert.match(body.bindings,/kept from production .*ACCOUNT_AUTH_DB:d1/);
  assert.doesNotMatch(uploads[0].source,/__PZ_CONFIG_\d{3}__/);assert.ok(uploads[0].source.includes('https://cfg0.example'));
  // The release is tagged with its commit, so the next preflight passes without any change to the stored manifest.
  const storedBefore=state.prepare("SELECT revision FROM vault_secrets WHERE name='PZ_BUILD_MANIFEST'").get().revision;
  r=await agent({worker:'portfolio-owner',commit,mode:'preflight'});body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.change,'no-op');assert.equal(body.baseline,'tagged commit '+commit.slice(0,12));
  assert.equal(state.prepare("SELECT revision FROM vault_secrets WHERE name='PZ_BUILD_MANIFEST'").get().revision,storedBefore);
  // Gates: unmerged commit, failing checks and unexplained production drift are refused and audited.
  compare='diverged';r=await agent({worker:'portfolio-owner',commit,mode:'deploy'});assert.equal(r.status,409);assert.match((await r.json()).error,/not on main/);compare='ahead';
  conclusion='failure';r=await agent({worker:'portfolio-owner',commit,mode:'deploy'});assert.equal(r.status,409);assert.match((await r.json()).error,/Checks/);conclusion='success';
  live='// hotfix deployed outside the release process';r=await agent({worker:'portfolio-owner',commit,mode:'deploy'});assert.equal(r.status,409);assert.match((await r.json()).error,/differs from its tagged commit/);
  assert.equal(uploads.length,1);
  const audit=state.prepare('SELECT action,actor,detail FROM vault_audit').all();
  assert.ok(audit.some(a=>a.action==='Deploy'&&a.actor==='Claude'&&/v-old → v-new/.test(a.detail)));assert.equal(audit.filter(a=>a.action==='Denied').length,3);
  assert.ok(!JSON.stringify(audit).includes(CF_TOKEN)&&!JSON.stringify(seen).includes(CF_TOKEN));
  // A revoked agent key loses access immediately.
  tracker.prepare("UPDATE tracker_api_keys SET revoked_at='2026-01-02'").run();assert.equal((await agent({worker:'portfolio-owner',commit,mode:'preflight'})).status,401);
 }finally{globalThis.fetch=realFetch}
});
test('migration 006 is additive and idempotent',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema/owner-state.sql','utf8'));db.prepare("INSERT INTO mailbox_state VALUES('pz','x',1,'t')").run();
 const m=readFileSync('schema/migrations/006-secret-chamber.sql','utf8');db.exec(m);db.exec(m);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mailbox_state').get().n,1);
 assert.throws(()=>db.prepare("INSERT INTO vault_secrets(id,workspace_id,name,kind,ciphertext,iv,bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run('x'.repeat(36),'owner','n','cloudflare-token','','',0,'t','t'));
});

test('Stripe sync uses only named encrypted owner Chamber connections, audits use and respects revocation',async()=>{
 const {env,state,get,post}=await setup();
 const spec=[['APT','SiteAPT'],['HUM','Humperdinck'],['YARR','Yarr'],['OWL','The Story Owl']];
 const key=n=>['rk','live',n].join('_'),config=n=>JSON.stringify({account_id:'acct_'+n,api_key:key(n)},null,2);
 const add=([n,project])=>({name:'PZ_STRIPE_'+n+'_READ',project,kind:'stripe-key',value:config(n),confirm:'yes'});
 const apt=add(spec[0]);
 assert.equal((await post('/secrets/create',{...apt,project:'Yarr'})).status,400);
 assert.equal((await post('/secrets/create',{...apt,kind:'other'})).status,400);
 assert.equal((await post('/secrets/create',{...apt,value:JSON.stringify({account_id:'acct_APT',api_key:['sk','live','APT'].join('_')})})).status,400);
 for(const entry of spec)assert.equal((await post('/secrets/create',add(entry))).status,303);
 // Simulate credentials saved in the earlier Chamber using its default project.
 state.prepare("UPDATE vault_secrets SET project='Shared systems' WHERE name LIKE 'PZ_STRIPE_%'").run();
 const page=await get('/secrets');
 assert.match(page.text,/Stripe reporting connections/);assert.match(page.text,/Stored<\/span><span><code>PZ_STRIPE_APT_READ/);
 for(const [n] of spec){assert(!page.text.includes(key(n)));assert(!page.text.includes('acct_'+n));}
 const rows=state.prepare('SELECT * FROM vault_secrets').all();
 assert(rows.every(r=>r.hint==='Restricted Stripe connection'&&!r.ciphertext.includes('rk_live')));
 const objects=new Map(),calls=[];
 env.BRAND_FILES={
  async get(k){const o=objects.get(k);return o?{size:o.length,etag:'stored',json:async()=>JSON.parse(o)}:null},
  async put(k,v){objects.set(k,v);return {etag:'stored'}}
 };
 const request=async(url,opts)=>{const n=opts.headers.Authorization.split('_').at(-1);calls.push(n);assert.equal(opts.method,'GET');return Response.json(url.endsWith('/account')?{id:'acct_'+n}:{data:[],has_more:false})};
 const cutoff=new Date('2026-11-27T19:00:00Z');
 assert.deepEqual(await stripeRefresh(env,cutoff,request),['complete']);
 assert.equal(calls.length,8);assert.equal(state.prepare("SELECT COUNT(*) n FROM vault_audit WHERE action='Used' AND actor='Stripe sync'").get().n,4);
 const r=rows.find(r=>r.name===apt.name);
 assert.equal((await post('/secrets/revoke',{id:r.id,revision:'1',confirm_name:apt.name})).status,303);
 // Legacy Worker binding must not re-enable a revoked credential.
 env.PZ_STRIPE_APT_READ=config('APT');calls.length=0;
 assert.deepEqual(await stripeRefresh(env,new Date('2026-11-27T20:00:00Z'),request),['partial']);
 assert(!calls.includes('APT'));assert.equal(JSON.parse(objects.get('finance/stripe-balance-v1/2026-11.json')).accounts[0].complete,false);
 delete env.VAULT_MASTER_KEY;calls.length=0;
 assert.deepEqual(await stripeRefresh(env,new Date('2026-11-27T21:00:00Z'),request),['unavailable']);assert.equal(calls.length,0);
});

test('Google login manager is owner-only and imports only the reviewed project client without leaking credentials',async()=>{
 const {env,state,get,post}=await setup();
 const path='/integrations/google-login';
 assert.equal((await dash.fetch(new Request(D+path,{headers:{accept:'application/json'}}),env,{})).status,403);
 const page=await get(path);assert.equal(page.status,200);assert.match(page.text,/Google login manager/);assert.match(page.text,/account\.statatlas\.app\/auth\/google\/callback/);
 const credentials=JSON.stringify({web:{client_id:'synthetic-client-id.apps.googleusercontent.com',client_secret:'synthetic-google-secret',redirect_uris:['https://account.projectzero.work/auth/google/callback']}});
 const fields={action:'import',project:'pz',confirm:'yes',credentials};
 assert.equal((await post(path,fields,'https://evil.example')).status,403);
 assert.equal((await post(path,{...fields,project:'hum'})).status,400);
 const saved=await post(path,fields);assert.equal(saved.status,200);assert.match(await saved.text(),/Google credentials stored securely/);
 const row=state.prepare("SELECT * FROM vault_secrets WHERE name='google-login-pz'").get();assert.equal(row.project,'Project Zero');assert.equal(row.hint,'Google Web client');assert.doesNotMatch(row.ciphertext,/synthetic-google-secret/);
 assert.equal((await post(path,fields)).status,409);
 const html=(await get(path)).text;assert.match(html,/Credentials stored in Chamber/);assert.doesNotMatch(html,/synthetic-google-secret|synthetic-client-id/);
});
