import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../workers/projectzero-commercial/worker.mjs';
const base='https://account.projectzero.work';
const sha=x=>createHash('sha256').update(x).digest('hex');
const tokens={owner:'a'.repeat(43),other:'b'.repeat(43),viewer:'c'.repeat(43)};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('schema/commercial.sql','utf8'));db.exec(readFileSync('schema/migrations/001-commercial-onboarding.sql','utf8'));db.exec(readFileSync('schema/migrations/001-commercial-onboarding.sql','utf8'));
 for(const user of Object.keys(tokens)){db.prepare("INSERT INTO users(id,oidc_subject,email) VALUES(?,?,?)").run(user,'test-'+user,user+'@example.invalid');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(tokens[user]),user,Math.floor(Date.now()/1000)+86400)}
 for(const w of ['alpha','beta']){db.prepare('INSERT INTO workspaces(id,name) VALUES(?,?)').run(w,w);db.prepare("INSERT INTO workspace_entitlements(workspace_id,plan,state,project_limit,integration_limit,sync_daily_limit,retention_days) VALUES(?,'private_beta','active',2,4,20,30)").run(w)}
 for(const row of [['alpha','owner','owner'],['alpha','viewer','viewer'],['beta','other','owner']])db.prepare('INSERT INTO memberships(workspace_id,user_id,role) VALUES(?,?,?)').run(...row);
 const prepare=sql=>({bind(...args){return {async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},runSync(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async run(){return this.runSync()}}},async first(){return db.prepare(sql).get()||null}});
 const env={CUSTOMER_ACCESS:'enabled',GOOGLE_LOGIN_MODE:'authorized',GOOGLE_CLIENT_ID:'synthetic-client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic-not-a-secret',GOOGLE_OAUTH_STATE_KEY:'a'.repeat(43),AUTH_RATE_LIMIT:{limit:async()=>({success:true})},COMMERCIAL_DB:{prepare,async batch(stmts){db.exec('BEGIN IMMEDIATE');try{const r=stmts.map(s=>s.runSync());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
 async function request(path,{actor='owner',method='GET',body,origin=base,bearer,access='enabled'}={}){
  const headers={};if(actor)headers.cookie='__Host-pz_session='+tokens[actor];if(origin!==null)headers.origin=origin;if(body!==undefined)headers['content-type']='application/json';if(bearer)headers.authorization='Bearer '+bearer;
  const response=await worker.fetch(new Request(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined}),{...env,CUSTOMER_ACCESS:access});
  const raw=await response.text();return {status:response.status,headers:response.headers,data:response.headers.get('content-type').includes('json')?JSON.parse(raw):raw};
 }
 return {db,request};
}
const brief=(name='New project',mode='Manual',assistant='None')=>({name,concept:'Small fictional example',audience:'Testing audience',product_type:'Web app / SaaS',business_model:'Subscriptions',budget_cents:2500,work_mode:mode,preferred_assistant:assistant,website:'https://example.invalid/',custom_instructions:'Prefer no paid services.'});
const projects=w=>'/api/v1/workspaces/'+w+'/projects';
const create=(req,w='alpha',actor='owner',body=brief())=>req(projects(w),{actor,method:'POST',body});
test('commercial onboarding remains closed and fails authentication, role and CSRF checks',async()=>{
 const {db,request:r}=fixture();try{
  const closed=await r('/internal/readiness',{actor:null,access:'disabled'});assert.equal(closed.status,404);assert.equal(closed.data.error,'Not found');
  assert.equal((await r('/workspaces/alpha/setup',{access:'disabled'})).status,503);
  assert.equal((await r(projects('alpha'),{method:'POST',body:brief(),access:'disabled'})).status,503);
  assert.equal((await r('/auth/signup')).status,404);
  assert.equal((await r('/workspaces/alpha/setup',{actor:null})).status,401);
  assert.equal((await r('/workspaces/alpha/setup',{actor:'other'})).status,404);
  assert.equal((await r('/workspaces/alpha/setup',{actor:'viewer'})).status,403);
  assert.equal((await create(r,'alpha','other')).status,404);
  assert.equal((await create(r,'alpha','viewer')).status,403);
  assert.equal((await r(projects('alpha'),{method:'POST',body:brief(),origin:'https://evil.invalid'})).status,403);
  assert.equal((await r(projects('alpha'),{method:'POST',body:brief(),origin:null})).status,403);
  assert.equal((await create(r,'alpha','owner',{...brief(),budget_cents:-1})).status,400);
  assert.equal((await create(r,'alpha','owner',{...brief(),website:'javascript:alert(1)'})).status,400);
  assert.equal((await create(r,'alpha','owner',{...brief(),preferred_assistant:'Claude'})).status,400);
  assert.equal((await create(r,'alpha','owner',{...brief(),concept:'x'.repeat(20000)})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM projects').get().n,0);
 }finally{db.close()}
});
test('automatic instructions, atomic project quota, independent workspace names and setup UI',async()=>{
 const {db,request:r}=fixture();try{
  const a=await create(r);assert.equal(a.status,201,JSON.stringify(a.data));assert.equal(a.data.assistantSetup.required,false);assert.equal(a.data.assistantSetup.connectionAvailable,false);
  assert.match(a.data.instructions,/New project/);assert.match(a.data.instructions,/\$25\.00/);assert.match(a.data.instructions,/Prefer no paid services/);
  const id=a.data.project.id,path=projects('alpha')+'/'+id;
  assert.equal((await r(path+'/onboarding')).data.project.name,'New project');
  assert.equal((await r(path+'/onboarding',{actor:'other'})).status,404);
  assert.equal((await r(projects('beta')+'/'+id+'/onboarding',{actor:'other'})).status,404);
  assert.equal((await r(path+'/assistant-keys',{method:'POST',body:{provider:'Claude'}})).status,400);
  assert.equal((await create(r)).status,409);
  assert.equal((await create(r,'beta','other')).status,201);
  assert.equal((await create(r,'alpha','owner',brief('Second'))).status,201);
  assert.equal((await create(r,'alpha','owner',brief('Third'))).status,409);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM project_onboarding').get().n,3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='project.created'").get().n,3);
  const html=await r('/workspaces/alpha/setup');assert.equal(html.status,200);assert.match(html.data,/Set up a project/);assert.match(html.data,/Advanced preferences \(optional\)/);
  assert.match(html.headers.get('content-security-policy'),/connect-src 'self'/);assert.equal(html.headers.get('cache-control'),'private, no-store');
  const script=await r('/assets/customer-setup-v1.js');assert.equal(script.status,200);assert.doesNotThrow(()=>new Function(script.data));
  assert.equal((await r('/assets/customer-setup-v1.js',{actor:null})).status,401);
 }finally{db.close()}
});
test('assistant keys are project-scoped, hashed, revocable, limited and read-only',async()=>{
 const {db,request:r}=fixture();try{
  const a=await create(r,'alpha','owner',brief('First','Mixed','ChatGPT + Claude'));assert.equal(a.status,201);const id=a.data.project.id,path=projects('alpha')+'/'+id;
  const a2=await create(r,'alpha','owner',brief('Second','Mixed','Claude'));assert.equal(a2.status,201);
  const b=await create(r,'beta','other',brief('Other','Mixed','Claude'));assert.equal(b.status,201);
  for(const [wid,pid,tid,title] of [['alpha',id,'t1','Own task'],['alpha',a2.data.project.id,'t2','Other project task'],['beta',b.data.project.id,'t3','Other tenant task']])db.prepare("INSERT INTO tasks(workspace_id,project_id,id,title,priority,status) VALUES(?,?,?,?,'P0','Not started')").run(wid,pid,tid,title);
  assert.equal((await r(path+'/assistant-keys',{method:'POST',body:{provider:'Claude'},actor:'viewer'})).status,403);
  assert.equal((await r(path+'/assistant-keys',{method:'POST',body:{provider:'Claude'},actor:'other'})).status,404);
  const created=await r(path+'/assistant-keys',{method:'POST',body:{provider:'ChatGPT'}});assert.equal(created.status,201,JSON.stringify(created.data));
  const {token,id:keyId}=created.data;assert.match(token,/^pza_[A-Za-z0-9_-]{43}$/);
  assert.equal(db.prepare('SELECT token_hash FROM project_assistant_keys').get().token_hash,sha(token));
  assert.equal((await r(path+'/assistant-keys',{method:'POST',body:{provider:'ChatGPT'}})).status,409);
  const listed=await r(path+'/assistant-keys');assert.equal(listed.status,200);assert.doesNotMatch(JSON.stringify(listed.data),/token_hash|pza_/);
  const route='/api/v1/assistant/project',read=await r(route,{actor:null,bearer:token});assert.equal(read.status,200,JSON.stringify(read.data));assert.deepEqual(read.data.tasks.map(x=>x.title),['Own task']);
  assert.equal((await r(route,{actor:null,bearer:token,method:'POST',body:{}})).status,405);
  assert.equal((await r(projects('alpha'),{actor:null,bearer:token})).status,401);
  assert.equal((await r(route,{actor:null,bearer:'pza_'+'z'.repeat(43)})).status,401);
  db.prepare('UPDATE project_assistant_keys SET request_count=100,request_day=?').run(new Date().toISOString().slice(0,10));
  assert.equal((await r(route,{actor:null,bearer:token})).status,429);
  db.prepare("UPDATE project_assistant_keys SET request_day='1900-01-01'").run();
  assert.equal((await r(route,{actor:null,bearer:token})).status,200);
  assert.equal((await r(projects('alpha')+'/'+a2.data.project.id+'/assistant-keys/'+keyId,{method:'DELETE'})).status,404);
  assert.equal((await r(path+'/assistant-keys/'+keyId,{method:'DELETE'})).status,200);
  assert.equal((await r(route,{actor:null,bearer:token})).status,401);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='assistant.created'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='assistant.revoked'").get().n,1);
  const replacement=await r(path+'/assistant-keys',{method:'POST',body:{provider:'Claude'}});assert.equal(replacement.status,201);
  db.prepare("UPDATE workspace_entitlements SET state='disabled' WHERE workspace_id='alpha'").run();
  assert.equal((await r(route,{actor:null,bearer:replacement.data.token})).status,401);
  assert.equal((await r(path+'/onboarding')).status,403);
 }finally{db.close()}
});
