import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

// Only the Vercel ingress may supply this header. Other deployments use the peer
// address (never arbitrary X-Forwarded-For). IPv6 privacy addresses share a /64.
export function authClientIp(req, vercel = Boolean(process.env.VERCEL)) {
  const forwarded = vercel ? req.headers['x-vercel-forwarded-for'] : undefined;
  let ip = typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 6) {
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [left, right = ''] = normalized.split('::');
    const start = left ? left.split(':') : [], end = right ? right.split(':') : [];
    ip = [...start, ...Array(8 - start.length - end.length).fill('0'), ...end].slice(0, 4).join(':') + '::/64';
  }
  return ip;
}
const key = (kind, value) => `auth:${kind}:${createHash('sha256').update(value).digest('hex')}`;
export function authThrottle(db, { clock = Date.now, capacity = 10000 } = {}) {
  return async (req, res, email, registration = false) => {
    const time = clock(), now = new Date(time).toISOString();
    const limits = [
      [key('ip', authClientIp(req)), 60, 900],
      [key('account', email.toLowerCase()), 10, 900],
      ...(registration ? [[key('registration', email.toLowerCase()), 1, 60]] : []),
    ];
    const retry = await db.transaction(async tx => {
      // Shared across warm instances. No hash, email or network operation under this lock.
      await tx.run("SELECT pg_advisory_xact_lock(hashtext('wadi:auth-throttle'))");
      await tx.run("DELETE FROM integration_rate_limits WHERE key LIKE 'auth:%' AND expires_at<=?", now);
      const rows = [];
      for (const [id] of limits) rows.push(await tx.get('SELECT count,expires_at FROM integration_rate_limits WHERE key=?', id));
      let retryAfter = 0;
      for (let i = 0; i < limits.length; i++) {
        if (rows[i]?.count >= limits[i][1]) retryAfter = Math.max(retryAfter, Math.ceil((Date.parse(rows[i].expires_at) - time) / 1000));
      }
      // Bound attacker-controlled cardinality; fail closed until space expires.
      const size = await tx.get("SELECT count(*) AS count FROM integration_rate_limits WHERE key LIKE 'auth:%'");
      if (Number(size.count) + rows.filter(row => !row).length > capacity) retryAfter = Math.max(retryAfter, 60);
      if (retryAfter) return retryAfter;
      for (const [id, , seconds] of limits) {
        await tx.run('INSERT INTO integration_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=integration_rate_limits.count+1', id, new Date(time + seconds * 1000).toISOString());
      }
      return 0;
    });
    if (retry) {
      res.set('Retry-After', String(retry));
      throw Object.assign(new Error(`Too many sign-in attempts. Try again in ${retry} seconds.`), { status: 429 });
    }
  };
}
