import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/projectzero-guides/worker.mjs';
const affiliate='https://shopify.pxf.io/rEMmK5';
const providers=[
{name:'Shopify',category:'commerce',label:'Storefront & fulfillment',icon:'shopping',url:'https://www.shopify.com/',pricing_url:'https://www.shopify.com/pricing',pricing:'Test pricing',benefits:'Test benefits',best_for:'Test audience',tradeoffs:'Test tradeoffs',verified_at:new Date().toISOString().slice(0,10)},
{name:'Netlify',category:'hosting',label:'Hosting & deployment',icon:'cloud',url:'https://www.netlify.com/',pricing_url:'https://www.netlify.com/pricing/',pricing:'Test pricing',benefits:'Test benefits',best_for:'Test audience',tradeoffs:'Test tradeoffs',verified_at:new Date().toISOString().slice(0,10)}
];
test('only the Shopify guide displays the exact user-approved sponsored link, with adjacent disclosure',async()=>{
 const prior=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
 const env={GUIDES:{get:async()=>({json:async()=>({schema:1,providers})})}},ctx={waitUntil:()=>{}};
 try{
  const get=async(path)=>{const r=await worker.fetch(new Request('https://guides.projectzero.work'+path),env,ctx);assert.equal(r.status,200);return r.text()};
  const shop=await get('/platforms/shopify');
  assert.ok(shop.includes('href="'+affiliate+'" rel="sponsored">Start with Shopify (affiliate link)'));
  assert.equal(shop.split(affiliate).length,2);
  assert.ok(shop.includes('Project Zero is a Shopify affiliate and may earn a commission'));
  assert.ok(shop.includes('href="https://www.shopify.com/pricing"'));
  assert.ok(shop.includes('href="https://www.shopify.com/"'));
  const disclosure=shop.indexOf('Project Zero is a Shopify affiliate'),link=shop.indexOf(affiliate);
  assert.ok(disclosure>=0&&link>disclosure&&link-disclosure<1000);
  assert.ok(!shop.includes('href="'+affiliate+'" target="_blank"'));
  for(const path of ['/','/platforms','/platforms/netlify','/privacy','/methodology']){
    assert.ok(!(await get(path)).includes(affiliate),path+' must not include tracked URL');
  }
  assert.ok((await get('/methodology')).includes('participates in the Shopify affiliate program'));
 }finally{if(prior===undefined)delete globalThis.caches;else globalThis.caches=prior;}
});
