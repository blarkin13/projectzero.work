import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync('workers/portfolio-owner/worker.mjs','utf8');
const start=source.indexOf('async function pdPage('),end=source.indexOf('function lcPlatformSummary(',start);
assert.ok(start>=0&&end>start);
const fn=source.slice(start,end).trim();
test('provider detail links to public guides without project data or tracking parameters',async()=>{
  const project='test-private-project';
  for(const name of ['DigitalOcean','Hostinger','Shopify','Cloudflare','Netlify']){
    const slug=name.toLowerCase(),item={name,slug,url:'https://example.com/provider',key:'host',label:'Hosting',icon:'cloud'};
    const deps={pdEntries:()=>[item],lcId:()=>true,lcWUrl:()=>'/lifecycle?id='+project+'&stage=setup',pdLoad:async()=>({providers:{}}),pdSafeUrl:()=>'',lcIcon:()=>'',esc:String,pdBadge:()=>'',lcWBlock:()=>'',pdReferral:()=>'',pdHref:()=>'/platforms/'+slug,lcPage:(_,body)=>body,response:(body,status)=>new Response(body,{status})};
    const render=new Function('deps','const {'+Object.keys(deps).join(',')+'}=deps;return ('+fn+');')(deps);
    const res=await render({},new URL('https://dash.projectzero.work/platforms/'+slug+'?project='+project));
    assert.equal(res.status,200);const body=await res.text();
    assert.ok(body.includes('href="https://guides.projectzero.work/platforms/'+slug+'" target="_blank" rel="noopener noreferrer"> View '+name+' guide'));
    assert.ok(!body.includes('href="https://guides.projectzero.work/platforms/'+slug+'?'));
    assert.ok(body.includes('Return to project setup'));
    assert.ok(body.includes('Official pricing'));
    assert.ok(!body.includes(' Visit '+name+' ↗'));
  }
});
