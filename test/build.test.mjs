import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('source-baseline.json','utf8'));
test('all five deployed Worker modules are represented',()=>{
  assert.equal(Object.keys(manifest.workers).length,5);
  for(const name of Object.keys(manifest.workers)) assert.ok(existsSync('workers/'+name+'/worker.mjs'));
});
test('baseline source manifest has valid digests',()=>{
  for(const m of Object.values(manifest.workers)) {
    assert.match(m.template_sha256,/^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(m.replacements) && m.replacements>=0);
  }
});
test('public source contains no production UUID literals',()=>{
  for(const name of Object.keys(manifest.workers)) {
    const source=readFileSync('workers/'+name+'/worker.mjs','utf8');
    assert.doesNotMatch(source,/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i);
  }
});
