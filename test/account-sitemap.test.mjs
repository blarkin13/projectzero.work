import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/projectzero-commercial/worker.mjs';
const origin='https://account.projectzero.work';
const req=(p,method='GET')=>new Request(origin+p,{method});
const env={CUSTOMER_ACCESS:'disabled'};
test('account sitemap exposes only public homepage and legal URLs without database access',async()=>{
 const res=await worker.fetch(req('/sitemap.xml'),env);
 assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^application\/xml/);
 const xml=await res.text();
 assert.match(xml,/xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
 assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]),[origin+'/',origin+'/privacy',origin+'/terms']);
 assert.doesNotMatch(xml,/\/auth\/|\/api\/|\/workspaces\/|\/internal\//);
});
test('robots declares sitemap and permits only public paths; callback remains closed',async()=>{
 const res=await worker.fetch(req('/robots.txt'),env);
 assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^text\/plain/);
 const robots=await res.text();assert.match(robots,/^User-agent: \*\nDisallow: \/\n/);
 assert.match(robots,/Sitemap: https:\/\/account\.projectzero\.work\/sitemap\.xml/);
 assert.deepEqual(robots.split('\n').filter(s=>s.startsWith('Allow: ')),['Allow: /$','Allow: /privacy$','Allow: /terms$','Allow: /robots.txt$','Allow: /sitemap.xml$']);
 assert.equal((await worker.fetch(req('/auth/google/callback'),env)).status,503);
 assert.equal((await worker.fetch(req('/api/v1/workspaces'),env)).status,503);
});
test('crawler files support HEAD without body and reject an unrecognized origin',async()=>{
 for(const path of ['/sitemap.xml','/robots.txt']){
  const res=await worker.fetch(req(path,'HEAD'),env);assert.equal(res.status,200);assert.equal(await res.text(),'');
  assert.equal((await worker.fetch(new Request('https://other.invalid'+path),env)).status,404);
 }
});
