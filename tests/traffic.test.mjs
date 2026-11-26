import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

const source=readFileSync(new URL('../workers/portfolio-owner/worker.mjs',import.meta.url),'utf8');
const start=source.indexOf('// PZ-09: private portfolio analytics.');
const end=source.indexOf('// End PZ-09 analytics scope.',start);
assert(start>=0&&end>start);
const sqlCalls=[];
async function safeRows(db,sql,...args){
  sqlCalls.push({db,sql,args});
  try{return db.prepare(sql).all(...args).map(r=>({...r}))}catch{return null}
}
const h=runInNewContext(source.slice(start,end)+'\n({trafficWindow,trafficApprovedProjects,trafficHosts,trafficScopedSql,trafficData,trafficStatus,trafficObservedTotal})',{URL,Date,safeRows,Number,Array});
const now=new Date('2026-11-26T02:00:00Z');
const windowFor=(q='')=>h.trafficWindow(new URL('https://example.invalid/traffic'+q),now);
const owner='owner@example.invalid';
const registryRows=[['SiteAPT','https://siteapt.app'],['Story Owl','https://www.thestoryowl.com'],['Project Zero','https://projectzero.work'],['Unrelated','https://unrelated.invalid']];
function fixture(){
  const TRACKER=new DatabaseSync(':memory:');
  TRACKER.exec('CREATE TABLE tracker_active_projects(project TEXT,website TEXT)');
  const add=TRACKER.prepare('INSERT INTO tracker_active_projects VALUES(?,?)');
  for(const r of registryRows)add.run(...r);
  const APT=new DatabaseSync(':memory:');
  APT.exec(`
    CREATE TABLE sites(id TEXT PRIMARY KEY,organization_id TEXT,hostname TEXT);
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT);
    CREATE TABLE site_memberships(organization_id TEXT,user_id TEXT,role TEXT);
    CREATE TABLE site_verification(site_id TEXT PRIMARY KEY,verified_at TEXT);
    CREATE TABLE daily_site_stats(site_id TEXT,day TEXT,pageviews INTEGER,sessions INTEGER,visitors INTEGER,updated_at TEXT,PRIMARY KEY(site_id,day));
    CREATE TABLE site_performance_snapshots(site_id TEXT,device TEXT,created_at TEXT);
    INSERT INTO users VALUES('owner','owner@example.invalid'),('other','other@example.invalid');
    INSERT INTO site_memberships VALUES('org1','owner','owner'),('org2','other','owner'),('viewer','owner','viewer');
    INSERT INTO sites VALUES
      ('s1','org1','siteapt.app'),('same_other','org2','siteapt.app'),
      ('viewer','viewer','www.siteapt.app'),('unverified','org1','www.thestoryowl.com'),
      ('s2','org1','thestoryowl.com'),('missing','org1','projectzero.work'),
      ('archive','org1','archived.siteapt.app'),('unrelated','org1','unrelated.invalid'),
      ('duplicate1','org1','www.projectzero.work'),('duplicate2','org1','www.projectzero.work');
    INSERT INTO site_verification VALUES('s1','2026-11-01'),('same_other','2026-11-01'),('viewer','2026-11-01'),
      ('s2','2026-11-01'),('missing','2026-11-01'),('archive','2026-11-01'),('unrelated','2026-11-01'),
      ('duplicate1','2026-11-01'),('duplicate2','2026-11-01');
    INSERT INTO daily_site_stats VALUES
      ('s1','2026-11-19',999,999,999,'2026-11-19'),('s1','2026-11-20',0,0,0,'2026-11-20'),
      ('s1','2026-11-26',5,2,3,'2026-11-26'),('s1','2026-11-27',999,999,999,'2026-11-27'),
      ('same_other','2026-11-26',999,999,999,'2026-11-26'),('viewer','2026-11-26',999,999,999,'2026-11-26'),
      ('unverified','2026-11-26',999,999,999,'2026-11-26'),('s2','2026-11-26',7,3,4,'2026-11-26'),
      ('archive','2026-11-26',999,999,999,'2026-11-26'),('unrelated','2026-11-26',999,999,999,'2026-11-26'),
      ('duplicate1','2026-11-26',999,999,999,'2026-11-26'),('duplicate2','2026-11-26',999,999,999,'2026-11-26');
    INSERT INTO site_performance_snapshots VALUES
      ('s1','Mobile','2026-11-20 00:00:00'),('s1','Mobile','2026-11-26T23:59:59Z'),
      ('s1','Desktop','2026-11-19 23:59:59'),('s1','Desktop','2026-11-27 00:00:00'),
      ('same_other','Mobile','2026-11-26'),('s2','Desktop','2026-11-26');
  `);
  const OWL=new DatabaseSync(':memory:');
  OWL.exec("CREATE TABLE visitor_daily(day TEXT,views INTEGER); INSERT INTO visitor_daily VALUES('2026-11-19',100),('2026-11-20',0),('2026-11-26',11),('2026-11-27',100)");
  return {TRACKER,APT,OWL,OWNER_EMAIL:owner};
}
test('UTC windows include today and reject invalid selection',()=>{
  assert.equal(windowFor('?days=7').start,'2026-11-20');
  assert.equal(windowFor('?days=7').end,'2026-11-27');
  assert.equal(windowFor().start,'2026-10-28');
  assert.equal(windowFor('?days=90').start,'2026-08-29');
  assert.equal(windowFor('?days=8'),null);
  assert.equal(windowFor('?project=foreign'),null);
  assert.equal(windowFor('?project=SiteAPT').project,'SiteAPT');
});
test('portfolio registry permits only exact known active project and domain pairs',()=>{
  const list=h.trafficApprovedProjects([{project:'SiteAPT',website:'https://siteapt.app.evil.invalid'},{project:'Yarr',website:'http://yarr.media'},{project:'Grim Thread',website:'https://thegrimthread.com'},{project:'Unrelated',website:'https://unrelated.invalid'}]);
  assert.equal(JSON.stringify(h.trafficHosts(list)),'[{"project":"Grim Thread","hostname":"thegrimthread.com"},{"project":"Grim Thread","hostname":"www.thegrimthread.com"}]');
});
test('scoped SQL binds owner email and hostnames, suppresses missing owner',()=>{
  const stmt=h.trafficScopedSql([{hostname:'siteapt.app'}],"bad' OR 1=1 --",'SELECT * FROM eligible');
  assert(!stmt.sql.includes("bad'"));
  assert.deepEqual([...stmt.args],['siteapt.app',"bad' OR 1=1 --"]);
  assert.equal(h.trafficScopedSql([{hostname:'siteapt.app'}],'','SELECT * FROM eligible'),null);
});
test('all active portfolio reports exclude foreign owner, viewer, archived hostname, unverified, unrelated and ambiguous registrations',async()=>{
  const env=fixture(),r=await h.trafficData(env,windowFor('?days=7'));
  assert.deepEqual(r.sites.map(s=>s.hostname).sort(),['projectzero.work','siteapt.app','thestoryowl.com']);
  assert.equal(h.trafficObservedTotal(r.daily,'views'),12);
  assert.equal(h.trafficObservedTotal(r.daily,'sessions'),5);
  assert.equal(h.trafficObservedTotal(r.perf,'snapshots'),3);
  assert.equal(h.trafficObservedTotal(r.owl,'views'),11);
  const empty=r.sites.find(s=>s.hostname==='projectzero.work');
  assert.equal(empty.observed_days,0);assert.equal(empty.views,null);
  const observed=r.daily.find(s=>s.day==='2026-11-20');assert.equal(observed.views,0);
});
test('selected business keeps its traffic, sessions and performance separate',async()=>{
  const r=await h.trafficData(fixture(),windowFor('?project=SiteAPT&days=7'));
  assert.equal(r.sites.length,1);assert.equal(r.sites[0].hostname,'siteapt.app');
  assert.equal(h.trafficObservedTotal(r.daily,'views'),5);
  assert.equal(h.trafficObservedTotal(r.perf,'snapshots'),2);
  assert.equal(r.includeOwl,false);assert.equal(r.owl.length,0);
});
test('Story Owl separate collector is only queried when selected or in portfolio',async()=>{
  const env=fixture();
  sqlCalls.length=0;
  await h.trafficData(env,windowFor('?project=SiteAPT&days=7'));
  assert(!sqlCalls.some(c=>c.db===env.OWL));
  const r=await h.trafficData(env,windowFor('?project=Story+Owl&days=7'));
  assert.equal(h.trafficObservedTotal(r.daily,'views'),7);assert.equal(h.trafficObservedTotal(r.owl,'views'),11);
});
test('archived/inactive portfolio projects are not queried even when selected',async()=>{
  const env=fixture();
  env.TRACKER.exec("DELETE FROM tracker_active_projects WHERE project='SiteAPT'");
  sqlCalls.length=0;
  const r=await h.trafficData(env,windowFor('?project=SiteAPT'));
  assert.equal(r.hosts.length,0);
  assert(!sqlCalls.some(c=>c.db===env.APT||c.db===env.OWL));
});
test('unavailable registry or absent owner fails closed',async()=>{
  const env=fixture();
  env.TRACKER.exec('DROP TABLE tracker_active_projects');
  sqlCalls.length=0;
  const r=await h.trafficData(env,windowFor());
  assert.equal(r.sites,null);
  assert(!sqlCalls.some(c=>c.db===env.APT||c.db===env.OWL));
  const other=fixture();delete other.OWNER_EMAIL;
  sqlCalls.length=0;
  const data=await h.trafficData(other,windowFor('?project=SiteAPT'));
  assert.equal(data.sites,null);assert(!sqlCalls.some(c=>c.db===other.APT));
});
test('integration metadata uses the same ownership and approved hostname boundary',async()=>{
  const r=await h.trafficStatus(fixture(),now);
  assert.deepEqual(r.map(s=>s.hostname).sort(),['projectzero.work','siteapt.app','thestoryowl.com']);
  assert.equal(r.find(s=>s.hostname==='siteapt.app').last_record,'2026-11-26');
});
test('observed zeros differ from missing or failed source',()=>{
  assert.equal(h.trafficObservedTotal(null,'views'),null);
  assert.equal(h.trafficObservedTotal([],'views'),null);
  assert.equal(h.trafficObservedTotal([{views:null}],'views'),null);
  assert.equal(h.trafficObservedTotal([{views:0}],'views'),0);
});
test('traffic page and integration status use the scoped owner-only path',()=>{
  assert(source.includes('response(await trafficPage(env,url)'));
  assert(source.includes('trafficStatus(env),'));
  const dispatch=source.indexOf("if(url.pathname==='/traffic')");
  const guard=source.indexOf('!await authorized(req,authEnv,ctx)');
  assert(guard>0&&dispatch>guard);
});
