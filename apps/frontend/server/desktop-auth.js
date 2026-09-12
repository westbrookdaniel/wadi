import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
const hash = value => createHash('sha256').update(value).digest('hex');
const challenge = value => createHash('sha256').update(value).digest('base64url');
const fail = () => { throw Object.assign(new Error('Desktop authorization expired or invalid. Sign in again.'), { status: 401 }); };
const codeInput = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/) });
export function addDesktopAuth(app, { db, sessionDays }) {
  app.post('/api/auth/desktop/authorize', async (req, res) => {
    const input = z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(req.body);
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) fail();
    const session = await db.get('SELECT user_id,profile_id FROM sessions WHERE token_hash=? AND expires_at>?', hash(token), new Date().toISOString());
    if (!session) fail();
    const code = randomBytes(32).toString('base64url');
    await db.run('DELETE FROM desktop_codes WHERE expires_at<?', new Date().toISOString());
    await db.run('INSERT INTO desktop_codes(code_hash,user_id,profile_id,challenge,expires_at) VALUES(?,?,?,?,?)', hash(code), session.user_id, session.profile_id, input.challenge, new Date(Date.now()+60000).toISOString());
    res.json({ code });
  });
  app.post('/api/auth/desktop/exchange', async (req, res) => {
    const input = codeInput.parse(req.body);
    const result = await db.transaction(async tx => {
      // DELETE RETURNING atomically consumes the code only when the verifier matches.
      const code = await tx.get('DELETE FROM desktop_codes WHERE code_hash=? AND challenge=? AND expires_at>? RETURNING user_id,profile_id', hash(input.code), challenge(input.verifier), new Date().toISOString());
      if (!code) fail();
      const token = randomBytes(32).toString('base64url');
      await tx.run('INSERT INTO sessions(id,user_id,profile_id,token_hash,expires_at) VALUES(?,?,?,?,?)', randomUUID(), code.user_id, code.profile_id, hash(token), new Date(Date.now()+sessionDays*86400000).toISOString());
      return { token };
    });
    res.json(result);
  });
}
