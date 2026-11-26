import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import worker from '../workers/projectzero-landing/worker.mjs';
const get=path=>worker.fetch(new Request('https://www.projectzero.work'+path));
test('public beta signup links to isolated account site; demo has no network-connected capability',async()=>{
 const landing=await get('/');assert.equal(landing.status,200);const home=await landing.text();assert.match(home,/href="https:\/\/account.projectzero.work\/">Sign in/);assert.match(home,/No credit card, paid subscription or automatic charges/);assert.match(home,/Free beta<\/span> Looking for beta testers/);assert.match(home,/href="mailto:contact@projectzero\.work\?subject=Project%20Zero%20beta%20request">Request beta access/);assert.match(home,/href="\/demo">Try the demo/);assert.match(home,/href="mailto:contact@projectzero\.work\?subject=Project%20Zero%20beta%20feedback"/);
 const demo=await get('/demo');assert.equal(demo.status,200);assert.match(demo.headers.get('content-security-policy'),/connect-src 'none'/);const html=await demo.text();assert.match(html,/\/assets\/demo-v4\.js/);assert.match(html,/Fictional businesses/);
 const asset=await get('/assets/demo-v4.js');assert.equal(asset.status,200);const js=await asset.text();assert.doesNotThrow(()=>new vm.Script(js));assert.match(js,/Generated project instructions/);assert.match(js,/Copy demo instructions/);assert.match(js,/Manual workflow/);assert.match(js,/Customer account connections are not available yet/);
 const model=vm.runInNewContext(js.slice(0,js.indexOf('(function startDemo()'))+'\ndemoModel()');const p=model.initial().projects[0];p.name='Example';p.budget=28;p.mode='Manual';p.assistant='Claude';p.concept='Fictional customer problem';const instructions=model.instructions(p);assert.match(instructions,/Project: Example/);assert.match(instructions,/\$28\.00/);assert.match(instructions,/Manual — no AI account required/);assert.doesNotMatch(instructions,/preferred assistant: Claude/);
 p.mode='Mixed';assert.match(model.instructions(p),/Mixed; preferred assistant: Claude/);
 assert.equal((await worker.fetch(new Request('https://www.projectzero.work/demo',{method:'POST'}))).status,405);
 assert.doesNotMatch(readFileSync('workers/projectzero-landing/worker.mjs','utf8'),/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i);
});
