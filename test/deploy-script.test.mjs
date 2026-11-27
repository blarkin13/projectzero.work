import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {release, parseMigration, restore, ReleaseError} from '../scripts/deploy.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const TOKEN='cf-token-'+'x'.repeat(30),ACCOUNT='0123456789abcdef0123456789abcdef',BASE=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
function world({live='// live v1',tag='',bindings=[{name:'PORTFOLIO',type:'d1',id:'db-1'},{name:'OWNER_EMAIL',type:'secret_text'}],crons=['*/15 * * * *'],versions=[{version_id:'11111111-1111-4111-8111-111111111111',percentage:100}]}={}){
 const st={live,tag,version:versions[0].version_id,puts:[],queries:[],deployPosts:[]};
 const json=x=>new Response(JSON.stringify({success:true,result:x}),{headers:{'content-type':'application/json'}});
 const fetch=async(url,init={})=>{const m=init.method||'GET',s=BASE+'/workers/scripts/portfolio-owner';assert.equal(init.headers.Authorization,'Bearer '+TOKEN);
  if(url===s+'/content/v2')return new Response(st.live);
  if(url===s+'/settings')return json({bindings});
  if(url===s+'/schedules')return json({schedules:crons.map(cron=>({cron}))});
  if(url===s+'/deployments'&&m==='GET')return json({deployments:[{id:'dep',versions:st.version===versions[0].version_id?versions:[{version_id:st.version,percentage:100}]}]});
  if(url===s+'/deployments'&&m==='POST'){st.deployPosts.push(JSON.parse(init.body));return json({id:'dep2'})}
  if(url.startsWith(s+'/versions/'))return json({id:url.split('/').pop(),annotations:st.tag?{'workers/tag':st.tag}:{}});
  if(url===s&&m==='PUT'){const meta=JSON.parse(await init.body.get('metadata').text());st.puts.push(meta);st.live=await init.body.get('worker.js').text();st.version='22222222-2222-4222-8222-222222222222';st.tag=meta.annotations['workers/tag'];return json({id:'portfolio-owner'})}
  if(url===BASE+'/d1/database/db-1/query'&&m==='POST'){st.queries.push(JSON.parse(init.body).sql);return json([{success:true}])}
  throw Error('Unexpected '+m+' '+url)};
 return {st,fetch};
}
const manifestFor=live=>({schema:1,workers:{'portfolio-owner':{metadata:{main_module:'worker.js',bindings:[{name:'PORTFOLIO',type:'d1',id:'db-1'}]},replacements:{'__PZ_CONFIG_001__':'https://private.example'},required_secret_names:['OWNER_EMAIL'],schedules:['*/15 * * * *'],source_sha256:sha(live),template_sha256:'0'.repeat(64)}}});
const commit='a'.repeat(40);
const base=(extra={})=>({worker:'portfolio-owner',mode:'preflight',manifest:manifestFor('// live v1'),candidate:'// new build https://private.example',metadata:{main_module:'worker.js',compatibility_date:'2026-01-01',bindings:[{name:'PORTFOLIO',type:'d1',id:'db-1'}]},commit,...extra});
test('preflight changes nothing; deploy uploads with kept secrets, tags the commit and verifies live source',async()=>{
 const {st,fetch}=world();const deps={token:TOKEN,account:ACCOUNT,fetch};
 const pre=await release(base(),deps);assert.equal(pre.change,'source change');assert.equal(pre.baseline,'manifest source_sha256');assert.equal(st.puts.length,0);assert.equal(st.queries.length,0);
 const migration={file:'schema/migrations/006-secret-chamber.sql',text:readFileSync('schema/migrations/006-secret-chamber.sql','utf8')};
 const vaultKey=Buffer.alloc(32,7).toString('base64');
 const out=await release(base({mode:'deploy',migration,vaultKey}),deps);
 assert.equal(out.new_version,'22222222-2222-4222-8222-222222222222');assert.equal(out.rollback_version,'11111111-1111-4111-8111-111111111111');assert.equal(out.vault_master_key,'set');
 assert.equal(st.queries.length,1);assert.match(st.queries[0],/CREATE TABLE IF NOT EXISTS vault_secrets/);
 const meta=st.puts[0];assert.deepEqual(meta.keep_bindings,['secret_text','secret_key']);assert.equal(meta.annotations['workers/tag'],commit);
 assert.deepEqual(meta.bindings.filter(b=>b.type==='secret_text').map(b=>b.name),['VAULT_MASTER_KEY']);
 assert.ok(!JSON.stringify(out).includes(TOKEN)&&!JSON.stringify(out).includes(vaultKey));
 // Next release uses the commit tag as its baseline, and never overwrites an existing master key.
 const gitShow=()=>'// new build __PZ_CONFIG_001__';
 const {st:st2,fetch:f2}=world({live:st.live,tag:commit,bindings:[{name:'PORTFOLIO',type:'d1',id:'db-1'},{name:'OWNER_EMAIL',type:'secret_text'},{name:'VAULT_MASTER_KEY',type:'secret_text'}]});
 const again=await release(base({mode:'deploy',vaultKey}),{token:TOKEN,account:ACCOUNT,fetch:f2,gitShow});
 assert.equal(again.baseline,'tagged commit '+commit.slice(0,12));assert.equal(again.change,'no-op');assert.equal(again.vault_master_key,'already set (never overwritten)');assert.equal(st2.puts.length,0);
});
test('release refuses drift, split traffic, binding/schedule changes and destructive migrations',async()=>{
 const run=async(w,extra={},gitShow)=>release(base(extra),{token:TOKEN,account:ACCOUNT,fetch:w.fetch,gitShow,gitLog:()=>['d'.repeat(40)]});
 await assert.rejects(run(world({live:'// hotfix'}),{},()=>'// other'),/matches neither the manifest baseline/);
 // A stale manifest is fine when a recent commit rebuilds exactly to the untagged live source.
 const ok=await release(base(),{token:TOKEN,account:ACCOUNT,fetch:world({live:'// v2 https://private.example'}).fetch,gitLog:()=>['b'.repeat(40),'c'.repeat(40)],gitShow:rev=>rev[0]==='c'?'// v2 __PZ_CONFIG_001__':'// v3 __PZ_CONFIG_001__'});
 assert.equal(ok.baseline,'untagged; matches commit '+'c'.repeat(12));
 await assert.rejects(run(world({live:'// hotfix',tag:commit}),{},()=>'// other'),/differs from its tagged commit/);
 await assert.rejects(run(world({versions:[{version_id:'11111111-1111-4111-8111-111111111111',percentage:50},{version_id:'x',percentage:50}]})),/one active version at 100%/);
 await assert.rejects(run(world({bindings:[{name:'OWNER_EMAIL',type:'secret_text'}]})),/bindings differ/);
 await assert.rejects(run(world({bindings:[{name:'PORTFOLIO',type:'d1',id:'db-1'}]})),/missing required secrets: OWNER_EMAIL/);
 await assert.rejects(run(world({crons:['0 * * * *']})),/cron schedules differ/);
 await assert.rejects(run(world(),{vaultKey:'short'}),/32 bytes/);
 assert.throws(()=>parseMigration('-- D1 binding: portfolio-owner/PORTFOLIO\nDROP TABLE mailbox_state;'),ReleaseError);
 assert.throws(()=>parseMigration('CREATE TABLE IF NOT EXISTS x(a);'),/header/);
 assert.throws(()=>restore('__PZ_CONFIG_009__',{}),/Unresolved/);
 const w=world();await assert.rejects(run(w,{mode:'deploy',migration:{file:'m.sql',text:'-- D1 binding: projectzero-commercial/COMMERCIAL_DB\nCREATE TABLE IF NOT EXISTS t(a);'}}),/targets projectzero-commercial/);assert.equal(w.st.puts.length,0);
});
test('rollback restores a known version at 100%',async()=>{
 const {st,fetch}=world();const out=await release({...base(),mode:'rollback',versionId:'33333333-3333-4333-8333-333333333333'},{token:TOKEN,account:ACCOUNT,fetch});
 assert.equal(out.active_version,'33333333-3333-4333-8333-333333333333');assert.deepEqual(st.deployPosts[0].versions,[{percentage:100,version_id:'33333333-3333-4333-8333-333333333333'}]);
});
