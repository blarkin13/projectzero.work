import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{stripeRefresh} from '../workers/portfolio-owner/worker.mjs';

const cutoff=new Date('2026-11-27T13:04:04Z');
const sec=s=>Date.parse(s)/1000;
const ids=['apt','hum','yarr','owl'];
const names=['APT','HUM','YARR','OWL'];
const row=(id,created=sec('2026-11-10T00:00:00Z'),overrides={})=>({id,created,currency:'usd',reporting_category:'charge',amount:1000,fee:30,net:970,...overrides});
function fixture(respond,missing=[]){
 const objects=new Map(),calls=[],writes=[];
 const env={BRAND_FILES:{
  async get(key){const o=objects.get(key);return o?{size:o.body.length,etag:o.etag,json:async()=>JSON.parse(o.body)}:null},
  async put(key,body,opts){const o=objects.get(key);assert.equal(opts.httpMetadata.contentType,'application/json');if(o?opts.onlyIf.etagMatches!==o.etag:opts.onlyIf.etagDoesNotMatch!=='*')return null;objects.set(key,{body,etag:String(writes.length+1)});writes.push(key);return {etag:String(writes.length)}}
 }};
 for(const [i,name] of names.entries()){if(!missing.includes(i))env['PZ_STRIPE_'+name+'_READ']=JSON.stringify({account_id:'acct_'+ids[i],api_key:['rk','live',ids[i]].join('_')})}
 const request=async(url,opts)=>{const u=new URL(url),id=opts.headers.Authorization.split('_').at(-1);assert.equal(u.origin,'https://api.stripe.com');assert.equal(opts.method,'GET');calls.push([id,u.pathname,u.searchParams.get('starting_after')]);if(u.pathname==='/v1/account')return Response.json({id:'acct_'+id});assert.equal(u.pathname,'/v1/balance_transactions');assert.equal(u.searchParams.get('limit'),'100');return Response.json(respond(id,u.searchParams.get('starting_after')))};
 const read=month=>JSON.parse(objects.get('finance/stripe-balance-v1/'+month+'.json').body);
 return {env,request,objects,calls,writes,read};
}
test('native sync filters cutoff, separates currency and reporting category, and validates readback',async()=>{
 const f=fixture((id,cursor)=>id!=='apt'?{data:[],has_more:false}:cursor?{data:[row('old',sec('2026-10-31T00:00:00Z'))],has_more:true}:{data:[row('future',sec('2026-11-28T00:00:00Z')),row('boundary',sec(cutoff.toISOString())),row('a'),row('b',undefined,{currency:'jpy'}),row('c',undefined,{reporting_category:'payout',amount:-100,fee:0,net:-100})],has_more:true});
 assert.deepEqual(await stripeRefresh(f.env,cutoff,f.request),['complete']);
 const s=f.read('2026-11');assert.equal(s.range_end,cutoff.toISOString());assert.equal(s.accounts[0].count,3);
 assert.deepEqual(s.accounts[0].groups.map(g=>[g.currency,g.type,g.count]),[['jpy','charge',1],['usd','charge',1],['usd','payout',1]]);
 assert.equal(s.accounts[1].count,0);assert.equal(s.accounts[1].complete,true);
 assert(!JSON.stringify(s).includes('boundary'));assert(!JSON.stringify(s).includes('acct_'));
 assert.deepEqual(await stripeRefresh(f.env,new Date('2026-11-27T12:00:00Z'),f.request),['unchanged']);
 assert.equal(f.writes.length,1);
});
test('missing, duplicate, invalid, and truncated accounts are incomplete',async()=>{
 let i=0;const f=fixture((id,cursor)=>id==='apt'?{data:[row('repeat')],has_more:true}:id==='hum'?{data:[row('invalid',undefined,{currency:'zzz'})],has_more:false}:id==='yarr'?{data:[row('page'+(++i))],has_more:true}:{data:[],has_more:false});
 assert.deepEqual(await stripeRefresh(f.env,cutoff,f.request),['partial']);
 assert.deepEqual(f.read('2026-11').accounts.map(a=>[a.complete,a.count,a.groups.length]),[[false,null,0],[false,null,0],[false,null,0],[true,0,0]]);
 assert.equal(f.calls.filter(c=>c[0]==='yarr'&&c[1]==='/v1/balance_transactions').length,5);
 const absent=fixture(()=>{throw Error('must not read')},[0,1,2,3]);assert.deepEqual(await stripeRefresh(absent.env,cutoff,absent.request),['unavailable']);assert.equal(absent.writes.length,0);
});
test('rollover uses exact UTC boundary with one bounded pass and no double counting',async()=>{
 const f=fixture(()=>({data:[row('new',sec('2026-12-01T00:00:00Z')),row('previous',sec('2026-11-30T23:59:59Z'))],has_more:false}));
 assert.deepEqual(await stripeRefresh(f.env,new Date('2026-12-02T00:00:00Z'),f.request),['complete','complete']);
 assert.equal(f.read('2026-11').range_end,'2026-12-01T00:00:00.000Z');
 assert.equal(f.read('2026-11').accounts[0].count,1);assert.equal(f.read('2026-12').accounts[0].count,1);
 assert.equal(f.calls.filter(c=>c[1]==='/v1/balance_transactions').length,4);
});
test('duplicate account pin or incorrect identity cannot sync',async()=>{
 const f=fixture(()=>({data:[],has_more:false}));
 f.env.PZ_STRIPE_HUM_READ=f.env.PZ_STRIPE_APT_READ;
 const request=(url,opts)=>url.endsWith('/account')?Response.json({id:'acct_wrong'}):f.request(url,opts);
 assert.deepEqual(await stripeRefresh(f.env,cutoff,request),['unavailable']);assert.equal(f.writes.length,0);
});
test('failed conditional write or readback produces a failure',async()=>{
 const f=fixture(()=>({data:[],has_more:false}));
 f.env.BRAND_FILES.put=async()=>null;assert.deepEqual(await stripeRefresh(f.env,cutoff,f.request),['conflict']);
 f.env.BRAND_FILES.put=async()=>({etag:'test'});assert.deepEqual(await stripeRefresh(f.env,cutoff,f.request),['failed']);
});
test('manual sync requires owner authentication',async()=>{
 const f=fixture(()=>({data:[],has_more:false}));
 const req=new Request('https://dash.projectzero.work/finance/sources/stripe-refresh',{method:'POST',headers:{Origin:'https://dash.projectzero.work'}});
 assert.equal((await worker.fetch(req,f.env,{})).status,403);assert.equal(f.writes.length,0);
});
