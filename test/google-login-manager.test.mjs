import test from 'node:test';
import assert from 'node:assert/strict';
import {googleLoginProbe,googleInstallPair} from '../workers/portfolio-owner/worker.mjs';
const target={origin:'https://account.example.com',start:'/auth/google',callback:'https://account.example.com/auth/google/callback',id:'GOOGLE_CLIENT_ID',secret:'GOOGLE_CLIENT_SECRET'};
const config={client_id:'test.apps.googleusercontent.com',client_secret:'synthetic-test-secret'};
const good=()=>new URL('https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:config.client_id,redirect_uri:target.callback,response_type:'code',state:'synthetic-state',scope:'openid email'}));
test('OAuth redirect probe does not follow redirects or expose state or client identifiers',async()=>{
 const out=await googleLoginProbe(target,async(url,init)=>{assert.equal(url,target.origin+target.start);assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:good()}})});
 assert.equal(out.state,'Redirect ready');assert.doesNotMatch(JSON.stringify(out),/synthetic-state|test.apps.googleusercontent.com/);
 const wrong=good();wrong.searchParams.set('redirect_uri','https://wrong.example.com/callback');
 assert.equal((await googleLoginProbe(target,async()=>new Response(null,{status:302,headers:{Location:wrong}}))).state,'Needs review');
 assert.equal((await googleLoginProbe(target,async()=>new Response(null,{status:503}))).state,'Not ready');
 assert.equal((await googleLoginProbe(target,async()=>new Response(null,{status:429}))).state,'Unverified');
 assert.equal((await googleLoginProbe(target,async()=>{throw Error('secret');})).state,'Unavailable');
});
test('new install is atomic, scoped and refuses existing or partially configured credentials',async()=>{
 for(const binding of [target.id,target.secret,'GRIM_GOOGLE_CLIENT_ID']){
  let writes=0;
  await assert.rejects(googleInstallPair(target,config,async(method)=>{if(method==='PATCH')writes++;return {bindings:[{name:binding,type:'plain_text'}]}}),/Existing or partial/);
  assert.equal(writes,0);
 }
 const retained={name:'SESSION_SECRET',type:'secret_text'},calls=[];let bindings=[retained];
 await googleInstallPair(target,config,async(method,path,body)=>{calls.push([method,path]);if(method==='GET')return {bindings};assert.equal(path,'secrets-bulk');assert.deepEqual(Object.keys(body.secrets),[target.id,target.secret]);assert.deepEqual(body.secrets[target.id],{name:target.id,type:'secret_text',text:config.client_id});bindings=[retained,...Object.values(body.secrets).map(({name,type})=>({name,type}))];});
 assert.deepEqual(calls,[['GET','settings'],['PATCH','secrets-bulk'],['GET','settings']]);
});
