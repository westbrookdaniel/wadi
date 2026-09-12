import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './main.js';
import { test } from 'node:test';
import { testDatabase } from './test-database.js';
test('account password, export and deletion respect ownership and revoke sessions', async t => {
let sentCode;
const runtime = createApp({ database: await testDatabase(t), sendVerificationEmail: async({code})=>{sentCode=code;} });
const server = runtime.app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let id;
const request = async (path, method, body, token) => {
  const response = await fetch(base+path, { method, headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
};
try {
  const email = `check-${randomUUID()}@example.com`, password = randomUUID(), replacement = randomUUID();
  const pending = await request('/api/auth/register','POST',{email,password}); assert.equal(pending.status,202);
  const first = await request('/api/auth/verify-email','POST',{challenge:pending.body.challenge,code:sentCode}); assert.equal(first.status,200); id=first.body.user.id;
  const token=first.body.token;
  const second=await request('/api/auth/login','POST',{email,password});
  const wrong=await request('/api/account/password','POST',{currentPassword:'wrong',newPassword:replacement},token); assert.equal(wrong.status,400);
  const changed=await request('/api/account/password','POST',{currentPassword:password,newPassword:replacement},token); assert.equal(changed.status,200);
  assert.equal((await request('/api/auth/me','GET',null,second.body.token)).status,401);
  assert.equal((await request('/api/auth/login','POST',{email,password})).status,401);
  assert.equal((await request('/api/auth/login','POST',{email,password:replacement})).status,200);
  const exported=await request('/api/account/export','GET',null,token); assert.equal(exported.status,200); assert.equal(exported.body.account.email,email); assert.equal(exported.body.profiles.length,1); assert.ok(!('password_hash' in exported.body.account)); assert.ok(!('sessions' in exported.body));
  assert.equal((await request('/api/account','DELETE',{email:'other@example.com',password:replacement},token)).status,400);
  assert.equal((await request('/api/account','DELETE',{email,password:'wrong'},token)).status,400);
  assert.equal((await request('/api/account','DELETE',{email,password:replacement},token)).status,200);
  assert.equal((await request('/api/auth/me','GET',null,token)).status,401);
  assert.equal((await runtime.db.all('SELECT id FROM profiles WHERE user_id=?',id)).length,0);
  console.log('PASS: password verification and change, session revocation, export exclusions, deletion confirmation, cascading deletion');
} finally {
  if(id) await runtime.db.run('DELETE FROM users WHERE id=?',id);
  await new Promise(resolve => server.close(resolve)); await runtime.db.close();
}

});
