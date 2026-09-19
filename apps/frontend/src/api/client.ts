import { desktopBridge } from '@/lib/desktop'
import { clearStoredToken, useAppStore } from '@/store/app-store'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(status >= 500 && !(status === 502 && body && typeof body === 'object' && 'code' in body && body.code === 'ADDON_PROVIDER_ERROR') ? 'Wadi is temporarily unavailable. Please try again in a moment.' : body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.length < 200 && !/[<>]/.test(body.error) ? body.error : 'Could not complete the request. Please try again.')
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

type ApiOptions = {
  method?: string
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}) {
  const revision = useAppStore.getState().authRevision
  const desktop = desktopBridge()
  if (desktop) {
    const response = await desktop.request(path, { method: options.method, body: options.body })
    if (response.status >= 400) {
      if (response.status === 401 && revision === useAppStore.getState().authRevision) clearStoredToken()
      throw new ApiError(response.status, response.body)
    }
    return response.body as T
  }
  const token = options.token ?? useAppStore.getState().token
  const headers = new Headers()

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).catch((error: unknown) => {
    if (options.signal?.aborted) throw error
    throw new ApiError(503, null)
  })

  const text = await response.text()
  const body = text ? parseBody(text) : null

  if (!response.ok) {
    if (response.status === 401 && revision === useAppStore.getState().authRevision) {
      clearStoredToken()
    }

    throw new ApiError(response.status, body)
  }

  return body as T
}

function parseBody(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
