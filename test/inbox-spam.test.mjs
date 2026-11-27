import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import account from '../workers/projectzero-commercial/worker.mjs';
import dash from '../workers/portfolio-owner/worker.mjs';
const A='https://account.projectzero.work',D='https://dash.projectzero.work';
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const hash=async v=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))).toString('hex');
function d1(sql){
 const wrap=(q,a=[])=>{const p=sql.prepare(q);return {first:async()=>p.get(...a)||null,run:async()=>{const r=p.run(...a);return {success:true,meta:{changes:Number(r.changes)}}},all:async()=>({results:p.all(...a)})}};
 return {prepare(q){return {...wrap(q),bind(...a){return wrap(q,a)}}},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
}
async function ownerSession(){
 const auth=new DatabaseSync(':memory:');auth.exec(readFileSync('schema/commercial.sql','utf8'));auth.exec(readFileSync('schema/migrations/004-owner-dashboard-auth.sql','utf8'));
 const db=d1(auth),session=token(),now=Math.floor(Date.now()/1000);
 auth.prepare("INSERT INTO users(id,oidc_subject,email) VALUES('u','subject','owner@gmail.com')").run();
 auth.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,'u',?)").run(await hash(session),now+3600);
 const ae={COMMERCIAL_DB:db,CUSTOMER_ACCESS:'enabled',GOOGLE_LOGIN_MODE:'owner_only',OWNER_EMAIL:'owner@gmail.com',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_OAUTH_STATE_KEY:token(),AUTH_RATE_LIMIT:{limit:async()=>({success:true})}};
 const markup=await (await account.fetch(new Request(A+'/auth/dashboard',{headers:{cookie:'__Host-pz_session='+session}}),ae)).text();
 const code=markup.match(/name="code" value="([a-zA-Z0-9_-]{43})"/)[1];
 const bridge=await dash.fetch(new Request(D+'/auth/bridge',{method:'POST',headers:{origin:A,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code})}),{ACCOUNT_AUTH_DB:db,OWNER_EMAIL:'owner@gmail.com'},{});
 return {db,cookie:bridge.headers.getSetCookie()[0].split(';')[0]};
}
const id=c=>c.repeat(64);
test('central inbox files marketing spam automatically and supports reversible Spam / Not spam',async()=>{
 const {db,cookie}=await ownerSession();
 const state=new DatabaseSync(':memory:');state.exec(readFileSync('schema/owner-state.sql','utf8'));
 const apt=new DatabaseSync(':memory:');apt.exec('CREATE TABLE owner_mail_messages(id TEXT,sender TEXT,recipient TEXT,subject TEXT,body TEXT,created_at TEXT,direction TEXT,read_at TEXT,message_id TEXT,reply_to TEXT)');
 const add=(i,sender,subject,body,at)=>state.prepare('INSERT INTO projectzero_mail_messages(id,sender,recipient,subject,body,message_id,created_at,bytes) VALUES(?,?,?,?,?,?,?,1)').run(id(i),sender,'support@projectzero.work',subject,body,'<'+i+'@x>',at);
 add('a','Growth Guru <guru@spam.example>','Shopify expert here','I help Shopify store owners. No upfront payment, pay only when you get results. Are you available on WhatsApp?','2026-11-27T01:00:00Z');
 add('b','Jane <jane@customer.example>','Order 1042 question','Hi, do you ship to Canada? My order number is 1042.','2026-11-27T02:00:00Z');
 add('c','seo@agency.example','Quick note','Hello, can I speak with the store owner about a wholesale order?','2026-11-27T03:00:00Z');
 apt.prepare("INSERT INTO owner_mail_messages VALUES('m1','pitch@leads.example','support@siteapt.app','Guaranteed Google rankings','Rank #1 on Google with high DA backlinks.','2026-11-27T04:00:00Z','inbound',NULL,'<m1@x>',NULL)").run();
 const env={ACCOUNT_AUTH_DB:db,OWNER_EMAIL:'owner@gmail.com',PORTFOLIO:d1(state),APT:d1(apt)};
 const get=async path=>{const r=await dash.fetch(new Request(D+path,{headers:{cookie,accept:'text/html'}}),env,{});assert.equal(r.status,200);return r.text()};
 const post=(fields)=>dash.fetch(new Request(D+'/mail/bulk',{method:'POST',headers:{cookie,origin:D,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}),env,{});
 let inbox=await get('/inbox');
 assert.match(inbox,/Order 1042 question/);assert.match(inbox,/Quick note/);assert.doesNotMatch(inbox,/Shopify expert here/);assert.doesNotMatch(inbox,/Guaranteed Google rankings/);
 assert.match(inbox,/ib-spam-tag ib-suspect[^>]*>Suspected spam/);assert.match(inbox,/>Spam<span class="ib-tabcount">2</);
 let spam=await get('/inbox?view=spam');
 assert.match(spam,/Shopify expert here/);assert.match(spam,/Guaranteed Google rankings/);assert.doesNotMatch(spam,/Order 1042 question/);
 assert.match(spam,/Shopify expert solicitation/);assert.match(spam,/value="notspam"/);
 assert.match(spam,/\/mail\/compose\?project=apt&amp;id=m1&amp;template=removal/);
 // Not spam is reversible, persists, and trusts the sender for later messages.
 const item=JSON.stringify(['pz',id('a')]);
 let r=await post([['view','spam'],['filter',''],['op',''],['op','notspam'],['item',item]]);
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/inbox?view=spam&notice=bulk-notspam&count=1');
 assert.deepEqual({...state.prepare('SELECT sender,spam FROM mailbox_spam').get()},{sender:'guru@spam.example',spam:0});
 add('d','guru@spam.example','Guest post opportunity','Do you accept guest posts?','2026-11-27T05:00:00Z');
 inbox=await get('/inbox');assert.match(inbox,/Shopify expert here/);assert.match(inbox,/Guest post opportunity/);assert.match(inbox,/Marked not spam by you/);
 r=await post({view:'active',filter:'',op:'spam',item});assert.equal(r.status,303);assert.match(r.headers.get('location'),/notice=bulk-spam/);
 assert.match(await get('/inbox?view=spam'),/Shopify expert here/);
 // Archive from Spam still works and existing archive state is honoured.
 r=await post({view:'spam',filter:'pz',op:'archive',item});assert.equal(r.status,303);
 assert.match(await get('/inbox?view=archive'),/Shopify expert here/);
 // Invalid operations for a view are rejected; cross-origin posts are refused.
 assert.equal((await post({view:'archive',filter:'',op:'spam',item})).status,400);
 assert.equal((await dash.fetch(new Request(D+'/mail/bulk',{method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/x-www-form-urlencoded'},body:'view=active&op=spam&item='+encodeURIComponent(item)}),env,{})).status,403);
 // Removal-request reply prefills a draft but still requires explicit confirmation to send.
 const compose=await get('/mail/compose?project=apt&id=m1&template=removal');
 assert.match(compose,/Please remove support@siteapt\.app/);assert.match(compose,/name="confirm" value="yes" required/);
 // Before migration 005 is applied, automatic filtering continues and manual spam actions are hidden.
 state.exec('DROP TABLE mailbox_spam');
 inbox=await get('/inbox');assert.match(inbox,/Spam overrides unavailable/);assert.doesNotMatch(inbox,/value="spam"/);assert.match(inbox,/Order 1042 question/);assert.doesNotMatch(inbox,/Guaranteed Google rankings/);
 assert.equal((await dash.fetch(new Request(D+'/inbox?view=spam'),env,{})).status,403);
});
test('migration 005 is additive and idempotent on the owner database',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema/owner-state.sql','utf8'));
 db.prepare("INSERT INTO mailbox_state VALUES('pz','x',1,'t')").run();
 const m=readFileSync('schema/migrations/005-mailbox-spam.sql','utf8');db.exec(m);db.exec(m);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mailbox_state').get().n,1);
 assert.throws(()=>db.prepare("INSERT INTO mailbox_spam VALUES('pz','x','',2,'t')").run());
});
