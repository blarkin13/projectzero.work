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
    let source=readFileSync('workers/'+name+'/worker.mjs','utf8');
    if (name === 'projectzero-guides') {
      // This exact Impact ownership token is intentionally published in the public HTML.
      // Every other UUID, including any duplicate of this token, remains prohibited.
      const publicTag='<meta name="impact-site-verification" value="ccb60450-a5bf-4152-8cb9-365881c1b1ec">';
      assert.ok(source.includes('<head><meta charset="utf-8">'+publicTag));
      assert.equal(source.split(publicTag).length,2);
      source=source.replace(publicTag,'');
    }
    assert.doesNotMatch(source,/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i);
  }
});
