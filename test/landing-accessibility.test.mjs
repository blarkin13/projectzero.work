import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import landing from '../workers/projectzero-landing/worker.mjs';
import owner from '../workers/portfolio-owner/worker.mjs';
const home='https://www.projectzero.work';
const dash='https://dash.projectzero.work';
test('landing heading hierarchy, target sizing and consent-only analytics',async()=>{
 const res=await landing.fetch(new Request(home));
 const html=await res.text();
 const tags=[...html.matchAll(/<h([1-6])(?:\s[^>]*)?>/g)].map(x=>Number(x[1]));
 assert.equal(tags[0],1);for(let i=1;i<tags.length;i++)assert.ok(tags[i]<=tags[i-1]+1,'heading level skipped');
 assert.ok(html.includes('min-height:44px'));assert.match(html,/button\.pz-footer-link\{min-height:44px\}/);assert.ok(html.includes('/assets/session-v2.js'));assert.ok(!html.includes('static.cloudflareinsights.com'));
 const footer=html.match(/<footer class="pz-standard-footer"[\s\S]*?<\/footer>/)[0];assert.match(footer,/Privacy Policy[\s\S]*Terms of Service[\s\S]*<button id="pz-analytics-settings"[^>]*>Analytics preferences<\/button>/);
 assert.match(res.headers.get('Content-Security-Policy'),/script-src 'self' https:\/\/siteapt\.app;/);
});
test('public visitors never probe the private dashboard; returning owners only redirect on authorized session response',async()=>{
 const js=await (await landing.fetch(new Request(home+'/assets/session-v2.js'))).text();
 const run=async(cookie,url,response)=>{let calls=0,redirected='',written='';const document={get cookie(){return cookie},set cookie(v){written=v}};
 const ctx={document,URL,location:{href:url,replace:v=>redirected=v},AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async(target)=>{calls++;assert.equal(target,dash+'/api/session-status');if(response instanceof Error)throw response;return response}};
 vm.runInNewContext(js,ctx);for(let i=0;i<10;i++)await Promise.resolve();return {calls,redirected,written}};
 assert.deepEqual(await run('',home,{status:204,ok:true}),{calls:0,redirected:'',written:''});
 assert.equal((await run('pz_workspace_hint=1',home+'/?home=1',{status:204,ok:true})).calls,0);
 assert.equal((await run('pz_workspace_hint=1',home,{status:204,ok:true})).redirected,dash+'/');
 const stale=await run('pz_workspace_hint=1',home,new Error('expired'));assert.equal(stale.redirected,'');assert.match(stale.written,/Max-Age=0/);
});
test('sign out clears only the navigation hint and requires owner authorization',async()=>{
 const request=new Request(dash+'/workspace-sign-out');
 const env={PROJECT_ZERO_AUD:'test-aud',OWNER_EMAIL:'owner@example.test'};
 const noAuth=await owner.fetch(request,env,{});assert.equal(noAuth.status,403);assert.equal(noAuth.headers.get('Set-Cookie'),null);
 const yes=await owner.fetch(request,env,{access:{aud:'test-aud',getIdentity:async()=>({email:'owner@example.test'})}});
 assert.equal(yes.status,302);assert.equal(yes.headers.get('Location'),'/cdn-cgi/access/logout');assert.match(yes.headers.get('Set-Cookie'),/pz_workspace_hint=;.*Max-Age=0/);
});
