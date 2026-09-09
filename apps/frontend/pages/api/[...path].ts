import type { NextApiRequest, NextApiResponse } from 'next'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from '../../server/main.js'
declare global { var wadiRuntime: ReturnType<typeof createApp> | undefined }
export const config = { api: { bodyParser: false, responseLimit: false, externalResolver: true } }
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!globalThis.wadiRuntime) {
    const database = process.env.DATABASE_URL?.replace(/^sqlite:/, '').replace(/\?.*$/, '') ?? resolve(process.cwd(), 'data/wadi.sqlite')
    mkdirSync(dirname(database), { recursive: true })
    globalThis.wadiRuntime = createApp({ database, sessionDays: Math.max(1, Math.min(365, Number(process.env.SESSION_TTL_DAYS) || 30)) })
  }
  return globalThis.wadiRuntime.app(req, res)
}
