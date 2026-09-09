export default {
  output: 'standalone',
  devIndicators: false,
  // Stream URLs can contain provider credentials. Keep them out of dev logs.
  logging: { incomingRequests: false },
  serverExternalPackages: ['@node-rs/argon2', 'express', '@mediabunny/server', 'mediabunny', 'node-av'],
  outputFileTracingIncludes: { '/api/*': ['./server/schema.sql', './server/conversion-worker.mjs', './node_modules/@mediabunny/server/**/*', './node_modules/mediabunny/**/*'] },
  async rewrites() { return [{ source: '/health', destination: '/api/health' }] },
}
