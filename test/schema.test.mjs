import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
for (const name of ['tracker','owner-state','commercial']) {
  test(name+' schema initializes an empty isolated database',()=>{
    const db=new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys = ON');
      db.exec(readFileSync('schema/'+name+'.sql','utf8'));
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      assert.ok(tables.length>0);
      for(const {name:table} of tables) {
        const quoted='"'+table.replaceAll('"','""')+'"';
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+quoted).get().n,0,table+' must have no live rows');
      }
    } finally {db.close();}
  });
}
