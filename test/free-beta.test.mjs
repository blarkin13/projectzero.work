import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/projectzero-commercial/worker.mjs';
test('retired beta and email entry points cannot create accounts or send messages',async()=>{
 const env={CUSTOMER_ACCESS:'enabled',GOOGLE_LOGIN_MODE:'authorized',BETA_EMAIL:{send(){throw Error('Unexpected email')}}};
 for(const path of ['/auth/signup','/auth/email','/auth/verify','/admin/beta'])for(const method of ['GET','POST']){
  const response=await worker.fetch(new Request('https://account.projectzero.work'+path,{method}),env);
  assert.equal(response.status,404);
 }
});
