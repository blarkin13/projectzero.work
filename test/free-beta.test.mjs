import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../workers/projectzero-commercial/worker.mjs';
const HOST='https://account.projectzero.work';
const fixtures=['schema/commercial.sql','schema/migrations/001-commercial-onboarding.sql','schema/migrations/002-free-beta.sql'];
const secret='test-turnstile-secret-not-for-production';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of fixtures)sql.exec(readFileSync(f,'utf8'));
 sql.exec(readFileSync(fixtures.at(-1),'utf8'));
 const inbox=[],prepare=s=>({bind(...a){return {async first(){return sql.prepare(s).get(...a)||null},async all(){return {results:sql.prepare(s).all(...a)}},runSync(){return {meta:{changes:Number(sql.prepare(s).run(...a).changes)}}},async run(){return this.runSync()}}}});
 const env={CUSTOMER_ACCESS:'beta',EMAIL_LOGIN_MODE:'open_beta',TURNSTILE_SITE_KEY:'test-site-key123',TURNSTILE_SECRET:secret,BETA_AUTH_LIMIT:{limit:async()=>({success:true})},BETA_EMAIL:{send:async m=>{inbox.push(m);return {messageId:'test-only'}}},COMMERCIAL_DB:{prepare,async batch(stmts){sql.exec('BEGIN IMMEDIATE');try{const r=stmts.map(s=>s.runSync());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}}};
 const req=(path,{method='GET',cookie,origin=HOST,form,body,ip='192.0.2.1',config=env}={})=>{
  const headers={'CF-Connecting-IP':ip};if(cookie)headers.cookie=cookie;if(origin)headers.origin=origin;
  let data;if(form){headers['content-type']='application/x-www-form-urlencoded';data=new URLSearchParams(form)}else if(body){headers['content-type']='application/json';data=JSON.stringify(body)}
  return worker.fetch(new Request(HOST+path,{method,headers,body:data}),config);
 };
 const mock=globalThis.fetch;
 let valid=true,action='beta_email',hostname='account.projectzero.work',seen=new Set();
 globalThis.fetch=async(u,o)=>{
  assert.equal(u,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(o.method,'POST');assert.equal(o.body.get('secret'),secret);assert.equal(o.redirect,'error');
  const token=o.body.get('response'),success=valid&&!seen.has(token);seen.add(token);
  return Response.json({success,action,hostname});
 };
 let next=0;
 const codeRequest=(email,opts={})=>req('/auth/email',{method:'POST',form:{email,accept:'yes','cf-turnstile-response':'proof-'+(++next)},...opts});
 const codeVerify=(cookie,code,opts={})=>req('/auth/verify',{method:'POST',cookie,form:{code},...opts});
 const code=()=>inbox.at(-1).text.match(/\b\d{8}\b/)[0];
 const nextCookie=r=>r.headers.getSetCookie().find(c=>c.startsWith('__Host-pz_beta_challenge=')).split(';')[0];
 const sessionCookie=r=>r.headers.getSetCookie().find(c=>c.startsWith('__Host-pz_session=')).split(';')[0];
 const signin=async email=>{const send=await codeRequest(email);assert.equal(send.status,303,await send.clone().text());const proof=nextCookie(send),pass=code();const confirm=await codeVerify(proof,pass);assert.equal(confirm.status,303,await confirm.clone().text());const cookie=sessionCookie(confirm);const list=await req('/api/v1/workspaces',{cookie});const workspaces=(await list.json()).workspaces;assert.equal(workspaces.length,1);return {cookie,workspace:workspaces[0].id,proof,pass}};
 return {sql,env,req,inbox,codeRequest,codeVerify,code,nextCookie,sessionCookie,signin,bot:(v,a,h)=>{valid=v;action=a;hostname=h},close(){globalThis.fetch=mock;sql.close()}};
}
test('beta signup is closed unless all email and verification gates are present',async()=>{
 const f=fixture();try{
  for(const config of [{...f.env,CUSTOMER_ACCESS:'disabled'},{...f.env,EMAIL_LOGIN_MODE:'closed'},{...f.env,TURNSTILE_SECRET:undefined},{...f.env,BETA_EMAIL:undefined}]){
   assert.equal((await f.req('/auth/signup',{config})).status,503);assert.equal((await f.req('/auth/email',{method:'POST',config})).status,503);
  }
  const page=await f.req('/auth/signup');assert.equal(page.status,200);assert.match(await page.text(),/No subscription or credit card required/);assert.match(page.headers.get('content-security-policy'),/frame-src https:\/\/challenges.cloudflare.com/);assert.equal(f.inbox.length,0);
 }finally{f.close()}
});
test('signup requires same origin, accepted terms, valid email and successful single-use bot token for exact action and hostname',async()=>{
 const f=fixture();try{
  assert.equal((await f.codeRequest('a@example.invalid',{origin:'https://evil.invalid'})).status,403);
  for(const form of [{email:'invalid',accept:'yes'},{email:'a@example.invalid',accept:'no'}])assert.equal((await f.codeRequest('a@example.invalid',{form})).status,400);
  f.bot(false,'beta_email','account.projectzero.work');assert.equal((await f.codeRequest('a@example.invalid')).status,403);
  f.bot(true,'other_action','account.projectzero.work');assert.equal((await f.codeRequest('a@example.invalid')).status,403);
  f.bot(true,'beta_email','evil.invalid');assert.equal((await f.codeRequest('a@example.invalid')).status,403);
  assert.equal(f.inbox.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  f.bot(true,'beta_email','account.projectzero.work');const form={email:'a@example.invalid',accept:'yes','cf-turnstile-response':'once'};assert.equal((await f.codeRequest('a@example.invalid',{form})).status,303);assert.equal((await f.codeRequest('a@example.invalid',{form})).status,403);
  assert.equal(f.inbox.length,1);
 }finally{f.close()}
});
test('verified code creates one free account and workspace, replay or wrong browser denied; sign-in restores saved data',async()=>{
 const f=fixture();try{
  const send=await f.codeRequest(' USER@example.invalid ');assert.equal(send.status,303);const proof=f.nextCookie(send),code=f.code();
  assert.match(send.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
  assert.equal(f.inbox[0].to,'user@example.invalid');assert.equal(f.inbox[0].from.email,'signin@auth.projectzero.work');assert(!f.sql.prepare('SELECT code_hash FROM beta_email_challenges').get().code_hash.includes(code));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  assert.equal((await f.codeVerify('__Host-pz_beta_challenge='+'b'.repeat(43),code)).status,400);
  assert.equal((await f.codeVerify(proof,code,{origin:'https://evil.invalid'})).status,403);
  const result=await f.codeVerify(proof,code);assert.equal(result.status,303);const cookie=f.sessionCookie(result);
  assert.equal((await f.codeVerify(proof,code)).status,400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM beta_accounts').get().n,1);
  assert.deepEqual({...f.sql.prepare('SELECT plan,state,project_limit,integration_limit,sync_daily_limit FROM workspace_entitlements').get()},{plan:'private_beta',state:'active',project_limit:3,integration_limit:0,sync_daily_limit:0});
  assert(!JSON.stringify(f.sql.prepare('SELECT * FROM sessions').all()).includes(cookie.split('=')[1]));
  const home=await f.req('/',{cookie});assert.match(await home.text(),/My workspace/);
  const workspace=(await (await f.req('/api/v1/workspaces',{cookie})).json()).workspaces[0].id;
  const projectBody={name:'Example',concept:'A fictional project',audience:'Fictional testers',product_type:'Web app / SaaS',business_model:'Undecided',budget_cents:0,work_mode:'Manual',preferred_assistant:'None'};
  const created=await f.req('/api/v1/workspaces/'+workspace+'/projects',{cookie,method:'POST',body:projectBody});assert.equal(created.status,201);
  assert.equal((await f.req('/auth/logout',{cookie,method:'POST'})).status,303);
  assert.equal((await f.req('/api/v1/workspaces',{cookie})).status,401);
  const again=await f.signin('user@example.invalid');assert.equal(again.workspace,workspace);
  assert.equal((await (await f.req('/api/v1/workspaces/'+workspace+'/projects',{cookie:again.cookie})).json()).projects[0].name,'Example');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n,1);
 }finally{f.close()}
});
test('five wrong codes, expiry, recipient limits, failed delivery and duplicate email identity fail safely',async()=>{
 const f=fixture();try{
  const send=await f.codeRequest('limit@example.invalid'),proof=f.nextCookie(send),code=f.code(),wrong=code==='00000000'?'99999999':'00000000';
  for(let i=0;i<5;i++)assert.equal((await f.codeVerify(proof,wrong)).status,400);
  assert.equal((await f.codeVerify(proof,code)).status,400);
  const second=await f.codeRequest('limit@example.invalid'),proof2=f.nextCookie(second);f.sql.exec('UPDATE beta_email_challenges SET expires_at=0');assert.equal((await f.codeVerify(proof2,f.code())).status,400);
  assert.equal((await f.codeRequest('limit@example.invalid')).status,303);assert.equal((await f.codeRequest('limit@example.invalid')).status,429);
  f.env.BETA_EMAIL={send:async()=>{throw Error('delivery failed')}};assert.equal((await f.codeRequest('fail@example.invalid')).status,503);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM beta_email_challenges WHERE email='fail@example.invalid'").get().n,0);
  f.env.BETA_EMAIL={send:async m=>{f.inbox.push(m)}};
  f.sql.exec("INSERT INTO users(id,oidc_subject,email) VALUES('g','google-existing','same@example.invalid')");
  const dup=await f.codeRequest('same@example.invalid');assert.equal((await f.codeVerify(f.nextCookie(dup),f.code())).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM beta_accounts').get().n,0);
 }finally{f.close()}
});
test('two beta accounts cannot read or write each other; scoped roadmap, revision, export and hard-delete',async()=>{
 const f=fixture();try{
  const a=await f.signin('one@example.invalid'),b=await f.signin('two@example.invalid');
  const base=w=>'/api/v1/workspaces/'+w+'/projects';
  const project={name:'Example',concept:'A fictional project',audience:'Fictional testers',product_type:'Web app / SaaS',business_model:'Undecided',budget_cents:0,work_mode:'Mixed',preferred_assistant:'Claude'};
  const r=await f.req(base(a.workspace),{cookie:a.cookie,method:'POST',body:project});assert.equal(r.status,201);
  const id=(await r.json()).project.id,path=base(a.workspace)+'/'+id,road=path+'/roadmap';
  const setup=await f.req('/workspaces/'+a.workspace+'/setup',{cookie:a.cookie});assert.match(await setup.text(),/Project roadmap/);
  assert.equal((await f.req(path+'/onboarding',{cookie:b.cookie})).status,404);
  assert.equal((await f.req(path+'/assistant-keys',{cookie:a.cookie,method:'POST',body:{provider:'Claude'}})).status,403);
  assert.equal((await f.req(road,{cookie:b.cookie})).status,404);
  const task={action:'create',title:'Verify checkout',description:'Fictional task',priority:'P0'};
  assert.equal((await f.req(road,{cookie:b.cookie,method:'POST',body:task})).status,404);
  assert.equal((await f.req(road,{cookie:a.cookie,method:'POST',origin:'https://evil.invalid',body:task})).status,403);
  const created=await f.req(road,{cookie:a.cookie,method:'POST',body:task});assert.equal(created.status,201);const tid=(await created.json()).id;
  const update={action:'status',id:tid,revision:1,status:'In progress'};
  assert.equal((await f.req(road,{cookie:a.cookie,method:'POST',body:update})).status,200);
  assert.equal((await f.req(road,{cookie:a.cookie,method:'POST',body:update})).status,409);
  const exported=await f.req('/account/export',{cookie:a.cookie});assert.equal(exported.status,200);const data=await exported.json();assert.equal(data.projects.length,1);assert.equal(data.tasks[0].status,'In progress');assert(!JSON.stringify(data).includes('two@example.invalid'));
  assert.equal((await f.req('/account/delete',{cookie:a.cookie,method:'POST',form:{confirm:'no'}})).status,403);
  assert.equal((await f.req('/account/delete',{cookie:a.cookie,method:'POST',form:{confirm:'DELETE'},origin:'https://evil.invalid'})).status,403);
  assert.equal((await f.req('/account/delete',{cookie:a.cookie,method:'POST',form:{confirm:'DELETE'}})).status,303);
  assert.equal((await f.req('/api/v1/workspaces',{cookie:a.cookie})).status,401);
  assert.equal((await f.req('/api/v1/workspaces',{cookie:b.cookie})).status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM projects').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close()}
});
test('global daily and monthly budget is fail closed under exhausted caps',async()=>{
 const f=fixture();try{
  const d=new Date().toISOString().slice(0,10),month=d.slice(0,7),far=9999999999;
  f.sql.prepare('INSERT INTO beta_email_limits VALUES(?,?,?,?)').run('global-day',d,30,far);
  assert.equal((await f.codeRequest('first@example.invalid')).status,429);
  f.sql.exec("DELETE FROM beta_email_limits WHERE bucket='global-day'");
  f.sql.prepare('INSERT INTO beta_email_limits VALUES(?,?,?,?)').run('global-month',month,300,far);
  assert.equal((await f.codeRequest('second@example.invalid')).status,429);assert.equal(f.inbox.length,0);
 }finally{f.close()}
});
test('native per-IP rate limit and expired-state maintenance',async()=>{
 const f=fixture();try{
  f.env.BETA_AUTH_LIMIT={limit:async()=>({success:false})};
  assert.equal((await f.codeRequest('a@example.invalid')).status,429);assert.equal(f.inbox.length,0);
  f.env.BETA_AUTH_LIMIT={limit:async()=>({success:true})};
  const send=await f.codeRequest('a@example.invalid');assert.equal(send.status,303);
  f.sql.exec('UPDATE beta_email_challenges SET expires_at=0;UPDATE beta_email_limits SET expires_at=0');
  await worker.scheduled({},f.env);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM beta_email_challenges').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM beta_email_limits').get().n,0);
 }finally{f.close()}
});
