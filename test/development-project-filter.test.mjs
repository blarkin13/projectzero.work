import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Exercise the real private renderers without bypassing production route authentication.
const source=readFileSync(new URL('../workers/portfolio-owner/worker.mjs',import.meta.url),'utf8');
const {trackerDashboard,trackerNotes,trackerRespond}=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {trackerDashboard,trackerNotes,trackerRespond};').toString('base64'));
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('schema/tracker.sql','utf8'));
 const project=db.prepare('INSERT INTO tracker_projects(project) VALUES(?)');
 for(const p of ['SiteAPT','Grim Thread','Empty Project','tCSC'])project.run(p);
 const insert=db.prepare("INSERT INTO tracker_tasks(project,task_id,priority,task,status,owner,due_date,source_updated,evidence,notes,repository,updated_at) VALUES(?,?,?,?,?,'ChatGPT','','','Evidence',?,'',?)");
 const task=(p,id,priority,status,notes='Note '+id,updated='2026-01-01')=>insert.run(p,id,priority,'Title '+id,status,notes,updated);
 task('SiteAPT','APT-TEST-1','P0','Blocked');
 task('SiteAPT','APT-TEST-2','P0','Done');
 task('SiteAPT','APT-TEST-3','P1','In progress');
 task('SiteAPT','APT-TEST-4','P0','Deferred','');
 for(let i=1;i<=30;i++)task('Grim Thread','GRIM-TEST-'+i,i===1?'P0':'P1',i===1?'Blocked':'Not started','Note GRIM-TEST-'+i,'2026-02-01');
 task('tCSC','ARCHIVE-TEST-1','P0','Blocked');
 const action=db.prepare("INSERT INTO tracker_owner_actions(task_id,instructions,action_status,updated_by) VALUES(?,'Owner instruction',?,'ChatGPT')");
 for(const [id,status] of [['APT-TEST-1','Needed'],['APT-TEST-3','Responded'],['APT-TEST-2','Needed'],['APT-TEST-4','Needed'],['GRIM-TEST-1','Needed'],['ARCHIVE-TEST-1','Needed']])action.run(id,status);
 const env={TRACKER:{prepare(sql){return {bind(...args){return {async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)}}}}}}};
 return {db,env};
}
const url=path=>new URL('https://dash.projectzero.work'+path);
function cards(html){
 assert.ok(html.indexOf('<div class="statcards">')<html.indexOf('<div class="tr-projects"'),'summary cards precede project filters');
 const block=html.match(/<div class="statcards">((?:<div><strong>[^<]*<\/strong><span>[^<]*<\/span><\/div>)+)<\/div>/);
 assert.ok(block,'summary cards present');
 return Object.fromEntries(Array.from(block[1].matchAll(/<strong>([^<]*)<\/strong><span>([^<]*)<\/span>/g),m=>[m[2],Number(m[1])]));
}
test('task tracker totals use the same selected project and additional filters as task rows',async()=>{
 const {db,env}=fixture();
 try{
  const page=await trackerDashboard(env,url('/development?project=SiteAPT'));
  assert.deepEqual(cards(page),{'Total tasks':4,Completed:1,'P0 remaining':1,Blocked:1});
  assert.doesNotMatch(page,/Owner actions needed:|\+ Add P0 feature/);
  assert.match(page,/Tasks · 4 matching/);
  assert.match(page,/href="\/development\/notes\?project=SiteAPT"/);
  assert.match(page,/APT-TEST-1/);
  assert.doesNotMatch(page,/Title GRIM-TEST-1/);
  const filtered=await trackerDashboard(env,url('/development?project=SiteAPT&status=Blocked'));
  assert.deepEqual(cards(filtered),{'Total tasks':1,Completed:0,'P0 remaining':1,Blocked:1});
  assert.match(filtered,/Tasks · 1 matching/);
  const none=await trackerDashboard(env,url('/development?project=SiteAPT&q=nonexistent'));
  assert.deepEqual(cards(none),{'Total tasks':0,Completed:0,'P0 remaining':0,Blocked:0});
  assert.match(none,/No matching tasks/);
  const all=await trackerDashboard(env,url('/development'));
  assert.deepEqual(cards(all),{'Total tasks':34,Completed:1,'P0 remaining':2,Blocked:2});
  assert.doesNotMatch(all,/Owner actions needed:|\+ Add P0 feature/);
  assert.doesNotMatch(all,/Title ARCHIVE-TEST-1/);
 }finally{db.close()}
});
test('notes filter scopes owner actions, blockers and recent notes before the 25-row limit',async()=>{
 const {db,env}=fixture();
 try{
  const page=await trackerNotes(env,url('/development/notes?project=SiteAPT'));
  assert.deepEqual(cards(page),{'Your actions needed':1,'Awaiting assistant follow-up':1,'Blocked tasks':1,'Recent notes':3});
  assert.match(page,/Note APT-TEST-2/);
  assert.doesNotMatch(page,/Title GRIM-TEST-1/);
  assert.match(page,/href="\/development\/notes\?project=Grim\+Thread"/);
  assert.match(page,/href="\/development\?project=SiteAPT"/);
  assert.match(page,/name="return_project" value="SiteAPT"/);
  const all=await trackerNotes(env,url('/development/notes'));
  assert.deepEqual(cards(all),{'Your actions needed':2,'Awaiting assistant follow-up':1,'Blocked tasks':2,'Recent notes':25});
  assert.doesNotMatch(all,/Title ARCHIVE-TEST-1/);
  const other=await trackerNotes(env,url('/development/notes?project=Grim+Thread'));
  assert.deepEqual(cards(other),{'Your actions needed':1,'Awaiting assistant follow-up':0,'Blocked tasks':1,'Recent notes':25});
  assert.doesNotMatch(other,/Title APT-TEST-1/);
 }finally{db.close()}
});
test('empty and archived project selections behave consistently on both pages',async()=>{
 const {db,env}=fixture();
 try{
  const notes=await trackerNotes(env,url('/development/notes?project=Empty+Project'));
  assert.deepEqual(cards(notes),{'Your actions needed':0,'Awaiting assistant follow-up':0,'Blocked tasks':0,'Recent notes':0});
  assert.match(notes,/No outstanding owner actions/);
  assert.match(notes,/No blocked tasks/);
  assert.match(notes,/No task notes/);
  const tasks=await trackerDashboard(env,url('/development?project=Empty+Project'));
  assert.deepEqual(cards(tasks),{'Total tasks':0,Completed:0,'P0 remaining':0,Blocked:0});
  assert.match(tasks,/href="\/development\?project=Empty\+Project" aria-current="page"/);
  const invalid=await trackerNotes(env,url('/development/notes?project=tCSC'));
  assert.deepEqual(cards(invalid),{'Your actions needed':2,'Awaiting assistant follow-up':1,'Blocked tasks':2,'Recent notes':25});
  assert.doesNotMatch(invalid,/Title ARCHIVE-TEST-1/);
 }finally{db.close()}
});
test('saving an owner response retains the selected project',async()=>{
 const {db,env}=fixture();
 try{
  const res=await trackerRespond(new Request(url('/development/notes/respond'),{method:'POST',headers:{origin:'https://dash.projectzero.work','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({task_id:'APT-TEST-1',revision:'1',owner_response:'Verified',action_status:'Responded',return_project:'SiteAPT'})}),env);
  assert.equal(res.status,303);
  assert.equal(res.headers.get('location'),'/development/notes?notice=response&project=SiteAPT');
  const page=await trackerNotes(env,url(res.headers.get('location')));
  assert.deepEqual(cards(page),{'Your actions needed':0,'Awaiting assistant follow-up':2,'Blocked tasks':1,'Recent notes':3});
  assert.equal(db.prepare("SELECT status FROM tracker_tasks WHERE task_id='APT-TEST-1'").get().status,'Blocked');
 }finally{db.close()}
});
