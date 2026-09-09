export default {
  devIndicators: false,
  // Stream URLs can contain provider credentials. Keep them out of dev logs.
  logging: { incomingRequests: false },
  serverExternalPackages: ['@node-rs/argon2', 'express'],
  outputFileTracingIncludes: { '/api/*': ['./server/schema.sql'] },
  async rewrites() { return [{ source: '/health', destination: '/api/health' }] },
}
