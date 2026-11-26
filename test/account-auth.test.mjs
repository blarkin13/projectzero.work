import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../workers/projectzero-commercial/worker.mjs';
const HOST='https://account.projectzero.work';
const ID='synthetic-client.apps.googleusercontent.com';
const COOKIE='__Host-pz_oauth';
const request=(path,opts={})=>new Request(HOST+path,{...opts,headers:{'CF-Connecting-IP':'192.0.2.1',...opts.headers}});
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
const b64=b=>Buffer.from(b).toString('base64url');
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`
 CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY,verifier_ciphertext TEXT NOT NULL,nonce_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
 CREATE TABLE users(id TEXT PRIMARY KEY,oidc_subject TEXT UNIQUE,email TEXT,disabled_at TEXT);
 CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT,deleted_at TEXT);
 CREATE TABLE memberships(workspace_id TEXT,user_id TEXT,role TEXT);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,revoked_at INTEGER);
 INSERT INTO users VALUES('u1','google-subject','example@example.invalid',NULL),('u2','other-subject','other@example.invalid',NULL);
 INSERT INTO workspaces VALUES('w1','Authorized workspace',NULL),('w2','Unrelated workspace',NULL);
 INSERT INTO memberships VALUES('w1','u1','owner'),('w2','u2','owner');
 `);
 const db={prepare(s){const stmt=sql.prepare(s);return {bind(...args){return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args)}}}}};
 const env={COMMERCIAL_DB:db,CUSTOMER_ACCESS:'enabled',GOOGLE_LOGIN_MODE:'invite_only',GOOGLE_CLIENT_ID:ID,GOOGLE_CLIENT_SECRET:'synthetic-not-a-secret',GOOGLE_OAUTH_STATE_KEY:b64(bytes(32)),AUTH_RATE_LIMIT:{limit:async()=>({success:true})}};
 return {sql,env};
}
async function start(env){
 const res=await worker.fetch(request('/auth/login'),env);
 assert.equal(res.status,302);
 const u=new URL(res.headers.get('location'));const state=u.searchParams.get('state');
 assert.equal(u.origin,'https://accounts.google.com');
 assert.equal(u.searchParams.get('redirect_uri'),HOST+'/auth/google/callback');
 assert.equal(u.searchParams.get('scope'),'openid email');
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.match(res.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
 const cookies=res.headers.get('set-cookie').split(';')[0];
 return {state,nonce:u.searchParams.get('nonce'),challenge:u.searchParams.get('code_challenge'),cookies};
}
const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...(await crypto.subtle.exportKey('jwk',keyPair.publicKey)),kid:'test-key',alg:'RS256',use:'sig'};
async function idToken(nonce,changes={}){
 const now=Math.floor(Date.now()/1000);
 const head=b64(JSON.stringify({alg:'RS256',kid:'test-key'}));
 const payload=b64(JSON.stringify({iss:'https://accounts.google.com',sub:'google-subject',email:'example@example.invalid',email_verified:true,aud:ID,iat:now,exp:now+600,nonce,...changes}));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(head+'.'+payload));
 return head+'.'+payload+'.'+b64(signature);
}
async function provider(nonce,challenge,changes={}){
 let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async (url,options)=>{
  calls++;
  if(url==='https://oauth2.googleapis.com/token'){
   assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
   assert.equal(options.body.get('redirect_uri'),HOST+'/auth/google/callback');
   const expected=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(options.body.get('code_verifier'))));
   assert.equal(expected,challenge);
   return Response.json({id_token:await idToken(nonce,changes),access_token:'never-persist-this'});
  }
  assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');
  return Response.json({keys:[jwk]});
 };
 return {calls:()=>calls,restore:()=>globalThis.fetch=original};
}
const callback=(flow,env,overrides={})=>worker.fetch(request('/auth/google/callback?state='+encodeURIComponent(overrides.state??flow.state)+'&code=test-code',{headers:{cookie:overrides.cookie??flow.cookies}}),env);
test('closed account homepage and canonical public legal redirects; all customer operations fail closed',async()=>{
 const env={CUSTOMER_ACCESS:'disabled'};
 const home=await worker.fetch(request('/'),env);assert.equal(home.status,200);assert.match(home.headers.get('x-robots-tag'),/noindex/);
 const markup=await home.text();assert.match(markup,/Customer accounts are not open yet/);
 assert.ok(markup.includes('https://www.projectzero.work/privacy'));assert.ok(markup.includes('https://www.projectzero.work/terms'));
 for(const path of ['/privacy','/terms','/privacy/','/terms/']){
  const r=await worker.fetch(request(path),env);assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://www.projectzero.work'+path.replace(/\/$/,''));assert.equal(r.headers.get('set-cookie'),null);
 }
 for(const path of ['/auth/login','/auth/google/callback','/auth/signup','/api/v1/workspaces'])assert.equal((await worker.fetch(request(path),env)).status,503);
 assert.equal((await worker.fetch(request('/internal/readiness'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://unexpected.example/'),env)).status,404);
});
test('login requires every configuration gate, and rate limited login performs no database writes',async()=>{
 const {sql,env}=fixture();delete env.GOOGLE_CLIENT_SECRET;
 assert.equal((await worker.fetch(request('/auth/login'),env)).status,503);
 env.GOOGLE_CLIENT_SECRET='synthetic';env.AUTH_RATE_LIMIT={limit:async()=>({success:false})};
 assert.equal((await worker.fetch(request('/auth/login'),env)).status,429);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM oauth_states').get().n,0);
});
test('start generates unique state, nonce, and encrypted verifier; secret is never stored in plaintext',async()=>{
 const {sql,env}=fixture();const a=await start(env),b=await start(env);
 assert.notEqual(a.state,b.state);assert.notEqual(a.nonce,b.nonce);
 const rows=sql.prepare('SELECT * FROM oauth_states').all();assert.equal(rows.length,2);
 assert(!JSON.stringify(rows).includes(a.state));assert(!JSON.stringify(rows).includes(a.nonce));
 assert(rows.every(r=>/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(r.verifier_ciphertext)));
});
test('callback rejects mismatched browser state and expired state without talking to Google',async()=>{
 const {sql,env}=fixture();const flow=await start(env);
 const mock=await provider(flow.nonce,flow.challenge);try{
  assert.equal((await callback(flow,env,{cookie:COOKIE+'='+b64(bytes(32))})).status,400);
  sql.exec('UPDATE oauth_states SET expires_at=0');
  assert.equal((await callback(flow,env)).status,400);
  assert.equal(mock.calls(),0);
 }finally{mock.restore()}
});
test('valid cryptographically signed callback creates hashed session for pre-authorized user, replay denied',async()=>{
 const {sql,env}=fixture();const flow=await start(env);const mock=await provider(flow.nonce,flow.challenge);
 try{
  const r=await callback(flow,env);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');
  const cookies=r.headers.getSetCookie();const token=cookies.find(v=>v.startsWith('__Host-pz_session=')).split(';')[0];
  assert(cookies.some(v=>v.startsWith(COOKIE+'=;')));assert.match(token,/^__Host-pz_session=[a-zA-Z0-9_-]{43}$/);
  const row=sql.prepare('SELECT * FROM sessions').get();assert.equal(row.user_id,'u1');assert.notEqual(row.token_hash,token.split('=')[1]);assert(!JSON.stringify(row).includes('never-persist'));
  const home=await worker.fetch(request('/',{headers:{cookie:token}}),env);assert.match(await home.text(),/You are signed in/);
  const list=await worker.fetch(request('/api/v1/workspaces',{headers:{cookie:token}}),env);assert.deepEqual((await list.json()).workspaces.map(x=>x.id),['w1']);
  const cross=await worker.fetch(request('/api/v1/workspaces/w2/overview',{headers:{cookie:token}}),env);assert.equal(cross.status,404);
  assert.equal((await callback(flow,env)).status,400);assert.equal(mock.calls(),2);
  const logout=await worker.fetch(request('/auth/logout',{method:'POST',headers:{cookie:token,origin:HOST}}),env);assert.equal(logout.status,303);
  assert.equal((await worker.fetch(request('/api/v1/workspaces',{headers:{cookie:token}}),env)).status,401);
 }finally{mock.restore()}
});
for(const [label,claims,expected] of [
 ['foreign audience',{aud:'another-client'},401],
 ['wrong issuer',{iss:'https://evil.example'},401],
 ['unverified email',{email_verified:false},401],
 ['wrong nonce',{nonce:b64(bytes(32))},401],
 ['unknown identity',{sub:'unknown-subject'},403],
 ['mismatched email',{email:'wrong@example.invalid'},403],
 ['expired token',{exp:1},401],
]){
 test('callback rejects '+label+' without creating any session',async()=>{
  const {sql,env}=fixture(),flow=await start(env),mock=await provider(flow.nonce,flow.challenge,claims);
  try{assert.equal((await callback(flow,env)).status,expected);assert.equal(sql.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM users').get().n,2)}finally{mock.restore()}
 });
}
test('logout requires same-origin POST',async()=>{
 const {env}=fixture();
 assert.equal((await worker.fetch(request('/auth/logout',{method:'POST',headers:{origin:'https://evil.example'}}),env)).status,403);
});

test('owner-only Google login rejects another verified Google account and has no beta routes',async()=>{
 const {env,sql}=fixture();env.GOOGLE_LOGIN_MODE='owner_only';env.OWNER_EMAIL='owner@gmail.com';
 const h=await worker.fetch(request('/'),env);assert.match(await h.text(),/Sign in with Google/);
 const flow=await start(env),mock=await provider(flow.nonce,flow.challenge,{email:'other@gmail.com'});
 try{const r=await callback(flow,env);assert.equal(r.status,403);assert.equal(sql.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);}finally{mock.restore();}
 assert.equal((await worker.fetch(request('/admin/beta'),env)).status,401);
 assert.equal((await worker.fetch(request('/auth/signup'),env)).status,503);
});
