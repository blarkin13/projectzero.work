import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import account from '../workers/projectzero-commercial/worker.mjs';
import landing from '../workers/projectzero-landing/worker.mjs';
import guides from '../workers/projectzero-guides/worker.mjs';
const origin='https://www.projectzero.work';
const accountOrigin='https://account.projectzero.work';
const env={CUSTOMER_ACCESS:'disabled'};
const guideOrigin='https://guides.projectzero.work';
const catalog={schema:1,providers:['Fresh Example','Stale Example'].map((name,i)=>({name,category:'hosting',url:'https://example.com/',pricing_url:'https://example.com/pricing',pricing:'Example historical pricing',benefits:'Example hosting benefits',best_for:'Example website',tradeoffs:'Verify limits',verified_at:i?'2020-01-01':new Date().toISOString().slice(0,10)}))};
globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
const guideEnv={GUIDES:{get:async()=>({json:async()=>catalog})}};
const ctx={waitUntil(){}};
const guideFetch=req=>guides.fetch(req,guideEnv,ctx);
const get=(p,method='GET',binding={fetch:guideFetch})=>landing.fetch(new Request(origin+p,{method}),{GUIDE_SITEMAP:binding});
const acct=(p,method='GET')=>account.fetch(new Request(accountOrigin+p,{method}),env);
test('main public sitemap contains all canonical public and guide pages, no private URLs',async()=>{
 const res=await get('/sitemap.xml');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^application\/xml/);
 const xml=await res.text();assert.match(xml,/xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
 const locs=s=>[...s.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 const guideMap=await guideFetch(new Request(guideOrigin+'/sitemap.xml'));assert.equal(guideMap.status,200);
 const guideURLs=locs(await guideMap.text());
 assert.deepEqual(locs(xml),['/','/demo','/privacy','/terms'].map(p=>origin+p).concat(guideURLs));
 assert.equal(new Set(guideURLs).size,guideURLs.length);
 for(const p of ['/','/privacy','/platforms','/compare','/methodology','/tools','/setups','/platforms/fresh-example','/platforms/stale-example','/tools/website-budget-worksheet'])assert.ok(guideURLs.includes(guideOrigin+p),p);
 for(const u of guideURLs){const r=await guideFetch(new Request(u));assert.equal(r.status,200,u);assert.doesNotMatch(r.headers.get('x-robots-tag')||'',/noindex/i,u);assert.ok((await r.text()).includes('rel="canonical" href="'+u+'"'),u);}
 const stale=await (await guideFetch(new Request(guideOrigin+'/platforms/stale-example'))).text();assert.match(stale,/Current rates require verification/);
 assert.doesNotMatch(xml,/account\.projectzero|\/auth\/|\/api\/|\/workspaces\/|\/internal\//);
 assert.match(await (await get('/robots.txt')).text(),/Sitemap: https:\/\/www\.projectzero\.work\/sitemap\.xml/);
 assert.match(await (await guideFetch(new Request(guideOrigin+'/robots.txt'))).text(),/Sitemap: https:\/\/guides\.projectzero\.work\/sitemap\.xml/);
 const head=await get('/sitemap.xml','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('main sitemap fails closed on unavailable or contaminated guide sitemap',async()=>{
 const broken=await get('/sitemap.xml','GET',{});assert.equal(broken.status,503);assert.equal(broken.headers.get('cache-control'),'no-store');
 const forged=await get('/sitemap.xml','GET',{fetch:async()=>new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://account.projectzero.work/</loc></url></urlset>',{headers:{'content-type':'application/xml'}})});assert.equal(forged.status,503);
});
test('canonical legal pages and homepage links are public',async()=>{
 for(const [path,title] of [['/privacy','Privacy Policy'],['/terms','Terms of Service']]){
  const r=await get(path);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('<h1>'+title+'</h1>'));assert.ok(html.includes('rel="canonical" href="'+origin+path+'"'));
  assert.doesNotMatch(html,/<script\b/i);
  const redirect=await get(path+'/');assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),origin+path);
  const head=await get(path,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
 const privacy=await (await get('/privacy')).text();assert.match(privacy,/Optional analytics/i);assert.match(privacy,/Google sign-in/i);
 const home=await (await get('/')).text();assert.ok(home.includes('href="'+origin+'/privacy"'));assert.ok(home.includes('href="'+origin+'/terms"'));
});
test('account legal and sitemap URLs permanently redirect; account is not indexable',async()=>{
 for(const path of ['/privacy','/terms','/privacy/','/terms/','/sitemap.xml']){
  for(const method of ['GET','HEAD']){const res=await acct(path,method);assert.equal(res.status,301);assert.equal(res.headers.get('location'),origin+path.replace(/\/$/,''));assert.equal(await res.text(),'');}
 }
 const res=await acct('/robots.txt');assert.equal(res.status,200);const robots=await res.text();assert.match(robots,/^User-agent: \*\nDisallow: \/\n/);assert.doesNotMatch(robots,/Sitemap:/);
 assert.deepEqual(robots.split('\n').filter(s=>s.startsWith('Allow: ')),['Allow: /$','Allow: /privacy$','Allow: /terms$','Allow: /sitemap.xml$','Allow: /robots.txt$']);
 assert.match((await acct('/')).headers.get('x-robots-tag'),/noindex/);
 assert.equal((await acct('/auth/google/callback')).status,503);assert.equal((await acct('/api/v1/workspaces')).status,503);
 const head=await acct('/robots.txt','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await account.fetch(new Request('https://other.invalid/sitemap.xml'),env)).status,404);
});

test('same standard footer on every public guide, home, demo, legal and account page',async()=>{
 const foot=html=>{const matches=[...html.matchAll(/<footer class="pz-standard-footer"[\s\S]*?<\/footer>/g)];assert.equal(matches.length,1);return matches[0][0]};
 const normal=html=>foot(html).replace(/<button id="pz-analytics-settings"[^>]*>Analytics preferences<\/button>/,'');
 const home=await(await get('/')).text(), expected=normal(home);
 assert.match(foot(home),/Analytics preferences/);
 for(const path of ['/demo','/privacy','/terms']){
  const html=await(await get(path)).text();assert.equal(normal(html),expected,path);assert.doesNotMatch(foot(html),/Analytics preferences/);
 }
 const accountHtml=await(await acct('/')).text();assert.equal(foot(accountHtml),expected);
 const xml=await(await guideFetch(new Request(guideOrigin+'/sitemap.xml'))).text();
 for(const [_,url] of xml.matchAll(/<loc>(.*?)<\/loc>/g)){
  const html=await(await guideFetch(new Request(url))).text();
  assert.equal(normal(html),expected,url);assert.match(foot(html),/Analytics preferences/,url);
 }
 for(const target of [origin+'/?home=1',guideOrigin+'/',guideOrigin+'/how-to','https://dash.projectzero.work/',accountOrigin+'/',origin+'/privacy',origin+'/terms',origin+'/sitemap.xml','mailto:support@projectzero.work'])assert.ok(expected.includes('href="'+target+'"'),target);
});

test('footer CSS and markup contract cannot drift between Workers',()=>{
 const workers=['projectzero-landing','projectzero-commercial','projectzero-guides','portfolio-owner'];
 const helpers=workers.map(name=>readFileSync('workers/'+name+'/worker.mjs','utf8').split('\n').slice(0,3).join('\n'));
 assert.match(helpers[0],/Shared Project Zero public footer contract/);
 for(const helper of helpers)assert.equal(helper,helpers[0]);
});
