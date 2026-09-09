import { clearStoredToken, useAppStore } from '@/store/app-store'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(typeof body === 'string' ? body : `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://127.0.0.1:4000')

type ApiOptions = {
  method?: string
  body?: unknown
  token?: string | null
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}) {
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
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  const body = text ? parseBody(text) : null

  if (!response.ok) {
    if (response.status === 401) {
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
