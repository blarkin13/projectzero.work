import test from 'node:test';
import assert from 'node:assert/strict';
import account from '../workers/projectzero-commercial/worker.mjs';
import landing from '../workers/projectzero-landing/worker.mjs';
const origin='https://www.projectzero.work';
const accountOrigin='https://account.projectzero.work';
const env={CUSTOMER_ACCESS:'disabled'};
const get=(p,method='GET')=>landing.fetch(new Request(origin+p,{method}));
const acct=(p,method='GET')=>account.fetch(new Request(accountOrigin+p,{method}),env);
test('main public sitemap contains only canonical public pages',async()=>{
 const res=await get('/sitemap.xml');
 assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^application\/xml/);
 const xml=await res.text();
 assert.match(xml,/xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
 assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),['/','/demo','/privacy','/terms'].map(p=>origin+p));
 assert.doesNotMatch(xml,/account\.projectzero|\/auth\/|\/api\/|\/workspaces\/|\/internal\//);
 assert.match(await (await get('/robots.txt')).text(),/Sitemap: https:\/\/www\.projectzero\.work\/sitemap\.xml/);
});
test('canonical legal pages and homepage links are public',async()=>{
 for(const [path,title] of [['/privacy','Privacy Policy'],['/terms','Terms of Service']]){
  const r=await get(path);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('<h1>'+title+'</h1>'));assert.ok(html.includes('rel="canonical" href="'+origin+path+'"'));
  assert.doesNotMatch(html,/<script\b/i);
  const redirect=await get(path+'/');assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),origin+path);
  const head=await get(path,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
 const privacy=await (await get('/privacy')).text();assert.match(privacy,/Optional analytics/i);assert.match(privacy,/Google sign-in/i);
 const home=await (await get('/')).text();assert.ok(home.includes('href="/privacy"'));assert.ok(home.includes('href="/terms"'));
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
