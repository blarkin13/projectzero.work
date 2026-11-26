import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../workers/portfolio-owner/worker.mjs';
const encoder=new TextEncoder();
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema/owner-state.sql','utf8'));
 const raw=new Map();
 const env={PORTFOLIO:{prepare(sql){return {bind(...args){return {async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},async first(){return db.prepare(sql).get(...args)}}}}}},TASK_DOCUMENTS:{async put(k,value){raw.set(k,new Uint8Array(value))},async get(k){return raw.has(k)?{body:raw.get(k)}:null}}};
 return {db,raw,env};
}
function mail(text,to='support@projectzero.work',rawSize){
 const bytes=encoder.encode(text);let rejected=null;return {from:'sender@example.com',to,raw: new Response(bytes).body,rawSize:rawSize??bytes.length,headers:new Headers({'subject':'Verification','message-id':'<test@example.com>'}),setReject(reason){rejected=reason},get rejected(){return rejected}};
}
test('Project Zero receives, deduplicates and privately archives an alias email',async()=>{
 const {db,raw,env}=fixture();
 try{
  const content='Content-Type: text/plain; charset=utf-8\r\n\r\nVerification: https://example.com/verified\r\n';
  await worker.email(mail(content),env);await worker.email(mail(content),env);
  const rows=db.prepare('SELECT * FROM projectzero_mail_messages').all();
  assert.equal(rows.length,1);assert.equal(rows[0].recipient,'support@projectzero.work');assert.match(rows[0].body,/https:\/\/example\.com\/verified/);
  assert.equal(raw.size,1);assert.deepEqual([...raw.values()][0],encoder.encode(content));assert.match([...raw.keys()][0],/^mail\/projectzero\/inbound\/[a-f0-9]{64}\.eml$/);
  await worker.email(mail(content,'partnerships@projectzero.work'),env);assert.equal(db.prepare('SELECT COUNT(*) n FROM projectzero_mail_messages').get().n,2);
 }finally{db.close()}
});
test('HTML-only verification email yields text and inert HTTPS link; MIME prefers plain text',async()=>{
 const {db,raw,env}=fixture();
 try{
  await worker.email(mail('Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Verify <a href=3D"https://example.com/confirm?x=3D1&amp;y=3D2">here</a></p><script>evil()</script><a href=3D"javascript:alert(1)">bad</a>'),env);
  const row=db.prepare('SELECT body FROM projectzero_mail_messages').get();
  assert.match(row.body,/https:\/\/example\.com\/confirm\?x=1&y=2/);assert.doesNotMatch(row.body,/<script|evil\(\)|javascript:/);
  const mime='Content-Type: multipart/alternative; boundary="alt"\r\n\r\n--alt\r\nContent-Type: text/html\r\n\r\n<p>HTML</p>\r\n--alt\r\nContent-Type: text/plain\r\n\r\nPlain preferred\r\n--alt--\r\n';
  await worker.email(mail(mime,'hello@projectzero.work'),env);
  assert.match(db.prepare("SELECT body FROM projectzero_mail_messages WHERE recipient='hello@projectzero.work'").get().body,/Plain preferred/);
 }finally{db.close()}
});
test('unknown recipients and oversize messages are rejected; raw mail requires authentication',async()=>{
 const {db,raw,env}=fixture();
 try{
  const unknown=mail('Content-Type: text/plain\r\n\r\nx','unknown@projectzero.work');await worker.email(unknown,env);assert.equal(unknown.rejected,'Unknown recipient');
  const large=mail('Content-Type: text/plain\r\n\r\nx','billing@projectzero.work',10485761);await worker.email(large,env);assert.equal(large.rejected,'Message exceeds 10 MB');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM projectzero_mail_messages').get().n,0);assert.equal(raw.size,0);
  const res=await worker.fetch(new Request('https://dash.projectzero.work/mail/raw?id='+'a'.repeat(64)),env,{});assert.equal(res.status,403);
 }finally{db.close()}
});
