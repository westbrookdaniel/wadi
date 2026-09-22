import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function addAccountRoutes(app, db) {
  app.post('/api/account/password', async (req, res) => {
    const input = z.object({ currentPassword: z.string().min(1).max(1024), newPassword: z.string().min(8).max(1024) }).parse(req.body);
    await db.transaction(async tx => {
      const user = await tx.get('SELECT password_hash FROM users WHERE id=? FOR UPDATE', req.user.id);
      if (!user || !await verify(user.password_hash, input.currentPassword)) fail(400, 'Current password is incorrect.');
      await tx.run('UPDATE users SET password_hash=? WHERE id=?', await hash(input.newPassword), req.user.id);
      await tx.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', req.user.id, req.tokenHash);
      await tx.run('DELETE FROM desktop_codes WHERE user_id=?', req.user.id);
      await tx.run('DELETE FROM integration_grants WHERE user_id=?', req.user.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/account/export', async (req, res) => {
    const data = await db.transaction(async tx => {
      await tx.run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const result = { version: 1, exported_at: new Date().toISOString(), account: await tx.get('SELECT id,email,created_at,introdb_enabled FROM users WHERE id=?', req.user.id) };
      for (const table of ['profiles','addons','lists','list_items','watch_states','user_settings']) result[table] = await tx.all(`SELECT * FROM ${table} WHERE user_id=?`, req.user.id);
      result.integrations = await tx.all('SELECT id,kind,name,profile_id,scopes,created_at,expires_at,last_used_at FROM integration_grants WHERE user_id=?', req.user.id);
      result.player_settings = await tx.all('SELECT player_settings.* FROM player_settings JOIN profiles ON profiles.id=player_settings.profile_id WHERE profiles.user_id=?', req.user.id);
      return result;
    });
    res.json(data);
  });
  app.delete('/api/account', async (req, res) => {
    const input = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), password: z.string().min(1).max(1024) }).parse(req.body);
    await db.transaction(async tx => {
      const user = await tx.get('SELECT email,password_hash FROM users WHERE id=? FOR UPDATE', req.user.id);
      if (!user || user.email !== input.email) fail(400, 'Enter your account email to confirm.');
      if (!await verify(user.password_hash, input.password)) fail(400, 'Password is incorrect.');
      await tx.run('DELETE FROM users WHERE id=?', req.user.id);
    });
    res.json({ ok: true });
  });
}
