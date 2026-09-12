import type { NextApiRequest, NextApiResponse } from 'next'
import { createApp } from '../../server/main.js'
declare global { var wadiRuntime: ReturnType<typeof createApp> | undefined }
export const config = { api: { bodyParser: false, externalResolver: true }, maxDuration: 30 }
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  globalThis.wadiRuntime ??= createApp({ sessionDays: Math.max(1, Math.min(365, Number(process.env.SESSION_TTL_DAYS) || 30)) })
  return globalThis.wadiRuntime.app(req, res)
}
