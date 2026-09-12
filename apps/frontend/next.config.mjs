export default {
  output: 'standalone',
  devIndicators: false,
  logging: { incomingRequests: false },
  serverExternalPackages: ['@node-rs/argon2', 'express', 'pg'],
  async rewrites() { return [{ source: '/health', destination: '/api/health' }] },
}
