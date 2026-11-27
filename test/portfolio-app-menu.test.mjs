import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import edge from '../workers/portfolio-brand-edge/worker.mjs';

const sites=[
 ['humperdinck.studio','HUM','.header-account-link','after','Web app'],
 ['siteapt.app','APT','header.site-header .sa-header-actions','append','Alerts &amp; app'],
 ['thegrimthread.com','GRIM','header.site-header > nav','append','Alerts &amp; app'],
 ['www.thestoryowl.com','OWL','header.site-header .site-actions','append','Alerts &amp; app'],
 ['yarr.media','YARR','header.site-header .site-actions','append','Alerts &amp; app']
];

test('portfolio branding layer puts the install entry in each real header and retains the manifest',async()=>{
 const Original=globalThis.HTMLRewriter;
 const actions=[];
 // Simulate the exact header target and head for each origin, rather than adding a document-wide banner.
 globalThis.HTMLRewriter=class {
  on(selector,handler){
   if(selector==='head'||selector===globalThis.testTarget||selector==='body'){
    const mock={append:(html)=>actions.push({selector,method:'append',html}),after:(html)=>actions.push({selector,method:'after',html}),prepend:(html)=>actions.push({selector,method:'prepend',html})};
    handler.element?.(mock);
   }
   return this;
  }
  transform(response){return response}
 };
 try{
  for(const [host,binding,target,method,label] of sites){
   actions.length=0;globalThis.testTarget=target;
   const env={FILES:{get:async()=>null},[binding]:{fetch:async()=>new Response('<html><head></head><body></body></html>',{headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"}})}};
   const r=await edge.fetch(new Request('https://'+host+'/'),env);
   assert.equal(r.status,200);
   const controls=actions.filter(a=>a.selector===target);
   assert.equal(controls.length,1,host);
   assert.equal(controls[0].method,method);
   assert.match(controls[0].html,/<details class="portfolio-app-menu">/);
   assert.ok(controls[0].html.includes(label));
   assert.match(controls[0].html,/href="\/install-app\/">Install web app/);
   assert.match(controls[0].html,/Alerts on this device/);
   if(binding==='APT')assert.match(controls[0].html,/dash\.siteapt\.app\/\?alerts=1/);
   else assert.match(controls[0].html,/Device push alerts are not available/);
   assert.equal(actions.filter(a=>a.selector==='body').length,0);
   assert.ok(actions.some(a=>a.selector==='head'&&a.html.includes('manifest.webmanifest')));
   assert.ok(actions.some(a=>a.selector==='head'&&a.html.includes('install-v2.css')));
   const manifest=await edge.fetch(new Request('https://'+host+'/install-app/manifest.webmanifest'),env);
   assert.equal(manifest.status,200);assert.equal((await manifest.json()).display,'standalone');
   const instructions=await edge.fetch(new Request('https://'+host+'/install-app/'),env);
   assert.match(await instructions.text(),/Add to Home Screen/);
   const js=await edge.fetch(new Request('https://'+host+'/install-app/install-v2.js'),env);
   const client=await js.text();assert.doesNotThrow(()=>new vm.Script(client));assert.match(client,/beforeinstallprompt/);
  }
 }finally{globalThis.HTMLRewriter=Original;delete globalThis.testTarget}
});

test('Project Zero removes the overview button and exposes install and action center in menus',()=>{
 const src=readFileSync(new URL('../workers/portfolio-owner/worker.mjs',import.meta.url),'utf8');
 const page=src.slice(src.indexOf('function page(title,body)'),src.indexOf('function page(title,body)')+4000);
 const nav=src.slice(src.indexOf('function primaryNav('),src.indexOf('function primaryNav(')+4000);
 assert.doesNotMatch(page,/id="pz-install-direct"/);
 assert.match(nav,/class="pz-desktop-app"/);
 assert.match(nav,/Alerts &amp; app/);
 assert.match(nav,/id="pz-install-direct"/);
 assert.match(nav,/href="\/actions">Open action center/);
 const utility=nav.slice(nav.indexOf('utility-links'),nav.indexOf('</nav>'));
 const sections=nav.slice(nav.indexOf('section-nav'),nav.indexOf('</header>'));
 assert.doesNotMatch(utility+sections,/Development tracker|dash\.cloudflare\.com|Public home/);
 assert.doesNotMatch(utility,/Alerts &amp; app|href="\/secrets"/,'top row holds only Account');
 assert.match(nav,/\['Brands','\/brands'\],\['Secrets','\/secrets'\]\]/,'Secrets is the last section tab');
 assert.ok(sections.indexOf("join('')")<sections.indexOf('Alerts &amp; app'),'Alerts & app follows the section tabs');
 assert.match(utility,/class="pz-desktop-app pz-account"><summary>[\s\S]*Account<\/summary><div class="pz-desktop-app-panel pz-account-panel"><a href="\/account">Account<\/a><a href="\/account#subscriptions">Subscriptions<\/a><a href="\/workspace-sign-out">Sign out<\/a><\/div><\/details>/);
 assert.match(src,/if\(url\.pathname==='\/account'\)return response\(pzAccountPage\(env\)/);
 const acct=src.slice(src.indexOf('function pzAccountPage('),src.indexOf('function pzAccountPage(')+1200);
 assert.match(acct,/id="subscriptions"/);
 assert.match(acct,/href="\/workspace-sign-out">Sign out/);
 const mobile=src.slice(src.indexOf('function pzMobileNav('),src.indexOf('function pzMobileNav(')+3000);
 assert.match(mobile,/<h3>Alerts &amp; app<\/h3>/);
 assert.match(mobile,/id="pz-install"/);
 assert.match(page,/mobile-v16\.js/);
});
