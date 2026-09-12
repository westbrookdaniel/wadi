import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function sendVerificationEmail({ email, code }) {
  if (!process.env.RESEND_API_KEY) fail(503, 'Email verification is temporarily unavailable.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Wadi <noreply@watchwadi.com>', to: [email], subject: 'Verify your Wadi email', text: `Your Wadi verification code is ${code}.\n\nEnter it in Wadi to finish signing in. This code expires in 15 minutes.\n\nIf you did not request this, ignore this email. Do not share the code with anyone.` }),
  });
  if (!response.ok) { console.warn('Verification email delivery failed', { status: response.status }); fail(503, 'Could not send the verification email. Please try again later.'); }
}
export function emailVerification({ app, db, session, sendEmail = sendVerificationEmail }) {
  async function begin(req, { email, passwordHash, userId = null }) {
    const id = randomBytes(32).toString('base64url'), code = String(randomInt(0, 100000000)).padStart(8, '0');
    const now = new Date().toISOString(), expires = new Date(Date.now() + 15 * 60000).toISOString();
    const ip = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress : req.socket.remoteAddress;
    const limitKey = digest(String(ip));
    await db.transaction(async tx => {
      await tx.run('DELETE FROM email_send_limits WHERE expires_at<?', now);
      const limit = await tx.get('INSERT INTO email_send_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=email_send_limits.count+1 RETURNING count', limitKey, new Date(Date.now()+3600000).toISOString());
      if (limit.count > 10) fail(429, 'Too many verification requests. Please try again in an hour.');
      await tx.run('SELECT pg_advisory_xact_lock(hashtext(?))', email);
      const previous = await tx.get('SELECT sent_at FROM email_verifications WHERE email=?', email);
      if (previous && Date.parse(previous.sent_at) > Date.now()-60000) fail(429, 'Please wait one minute before requesting another code.');
      await tx.run('DELETE FROM email_verifications WHERE expires_at<?', now);
      await tx.run('INSERT INTO email_verifications(id,email,password_hash,user_id,code_hash,expires_at,sent_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET id=excluded.id,password_hash=excluded.password_hash,user_id=excluded.user_id,code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,sent_at=excluded.sent_at', digest(id), email, passwordHash, userId, digest(id+code), expires, now);
    });
    try { await sendEmail({ email, code }); }
    catch (error) { await db.run('DELETE FROM email_verifications WHERE id=?', digest(id)); throw error; }
    return { verification_required: true, challenge: id, email };
  }
  app.post('/api/auth/verify-email', async (req, res) => {
    const input = z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().regex(/^\d{8}$/) }).parse(req.body);
    const user = await db.transaction(async tx => {
      const pending = await tx.get('SELECT * FROM email_verifications WHERE id=? FOR UPDATE', digest(input.challenge));
      if (!pending || Date.parse(pending.expires_at) <= Date.now() || pending.attempts >= 5) return null;
      if (!timingSafeEqual(Buffer.from(pending.code_hash,'hex'), Buffer.from(digest(input.challenge+input.code),'hex'))) {
        await tx.run('UPDATE email_verifications SET attempts=attempts+1 WHERE id=?', pending.id); return null;
      }
      await tx.run('DELETE FROM email_verifications WHERE id=?', pending.id);
      const now = new Date().toISOString();
      if (pending.user_id) {
        return tx.get('UPDATE users SET email_verified_at=? WHERE id=? AND password_hash=? RETURNING *', now, pending.user_id, pending.password_hash);
      }
      return tx.get('INSERT INTO users(id,email,password_hash,email_verified_at) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING *', randomUUID(), pending.email, pending.password_hash, now);
    });
    if (!user) fail(400, 'That code is invalid or expired. Request a new code if needed.');
    await session(user, res);
  });
  return { begin };
}
