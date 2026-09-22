export default {
  output: 'standalone',
  devIndicators: false,
  logging: { incomingRequests: false },
  serverExternalPackages: ['@node-rs/argon2', 'express', 'pg', '@modelcontextprotocol/sdk'],
  async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }, { key: 'X-Content-Type-Options', value: 'nosniff' }] }] },
  async rewrites() { return [{ source: '/health', destination: '/api/health' }, { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/metadata' }, { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/resource' }, { source: '/.well-known/oauth-protected-resource/api/mcp', destination: '/api/oauth/resource' }] },
}
