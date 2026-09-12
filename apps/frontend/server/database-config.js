import { checkServerIdentity } from 'node:tls';

// These variables stay on the server. Railway's private CA authenticates the
// database even when the connection travels through its public TCP proxy.
export function databaseConfig(connectionString, env = process.env) {
  if (!connectionString || !/^postgres(ql)?:/.test(connectionString)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  if (!env.DATABASE_SSL_CA) return { connectionString };
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: {
      ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_SERVERNAME ? { checkServerIdentity: (_hostname, certificate) => checkServerIdentity(env.DATABASE_SSL_SERVERNAME, certificate) } : {}),
    },
  };
}
