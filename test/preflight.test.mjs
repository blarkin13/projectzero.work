import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { configDigest,verifyRelease } from '../scripts/preflight.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const now=Date.parse('2026-01-01T00:00:00Z');
function fixture(){
 const name='portfolio-owner',template='export default { fetch(){return new Response("__PZ_CONFIG_001__")} };',candidate=template.replace('__PZ_CONFIG_001__','synthetic');
 const entry={template_sha256:sha(template),source_sha256:sha(candidate),replacements:{__PZ_CONFIG_001__:'synthetic'},metadata:{main_module:'worker.js',bindings:[{name:'DB',type:'d1',id:'synthetic'}],keep_bindings:['secret_text']},required_secret_names:['TEST_KEY'],schedules:['*/15 * * * *']};
 const observed={worker:name,observed_at:new Date(now).toISOString(),source_sha256:entry.source_sha256,configuration_sha256:configDigest(entry),deployment_id:'synthetic-deployment',versions:[{version_id:'synthetic-version',percentage:100}]};
 return {name,template,candidate,entry,observed,now};
}
test('unchanged baseline passes without deployment',()=>assert.equal(verifyRelease(fixture()).change,'no-op'));
test('reviewed source edit passes if live baseline unchanged',()=>{const f=fixture();f.template+='\n// reviewed change';f.candidate+='\n// reviewed change';assert.equal(verifyRelease(f).change,'source change')});
test('stale observation fails closed',()=>{const f=fixture();f.now+=16*60*1000;assert.throws(()=>verifyRelease(f),/15 minutes/)});
test('source drift fails closed',()=>{const f=fixture();f.observed.source_sha256='f'.repeat(64);assert.throws(()=>verifyRelease(f),/source drift/)});
test('binding or schedule drift fails closed',()=>{const f=fixture();f.entry.schedules=[];assert.throws(()=>verifyRelease(f),/configuration drift/)});
test('candidate tampering fails closed',()=>{const f=fixture();f.candidate+='\n// unexpected';assert.throws(()=>verifyRelease(f),/Candidate/)});
test('split traffic fails closed',()=>{const f=fixture();f.observed.versions[0].percentage=50;assert.throws(()=>verifyRelease(f),/100%/)});
test('secret values cannot be included in metadata',()=>{const f=fixture();f.entry.metadata.bindings.push({name:'TEST_KEY',type:'secret_text',text:'synthetic'});assert.throws(()=>configDigest(f.entry),/Secret values/)});
test('commercial enablement fails closed',()=>{const f=fixture();f.name='projectzero-commercial';f.observed.worker=f.name;f.entry.metadata.bindings.push({name:'CUSTOMER_ACCESS',type:'plain_text',text:'enabled'});f.observed.configuration_sha256=configDigest(f.entry);assert.throws(()=>verifyRelease(f),/Only configured owner access/)});
