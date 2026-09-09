import { useEffect, useState } from 'react'
import { z } from 'zod'
import { apiRequest, API_BASE_URL } from '@/api/client'
import { useDeviceStore } from '@/store/device-store'
const created = z.object({ id: z.string().uuid() })
const status = z.object({ status: z.enum(['working', 'ready', 'failed']), progress: z.number(), error: z.string().optional() })
type Preparation = { source: string; url?: string; progress: number; error?: string }
export function useConvertedStream(source: string | undefined) {
  const enabled = useDeviceStore(state => state.conversion)
  const [state, setState] = useState<Preparation | null>(null)
  useEffect(() => {
    if (!enabled || !source) return
    let cancelled = false, id: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const release = () => { if (id) void apiRequest(`/api/conversions/${id}`, { method: 'DELETE' }).catch(() => {}) }
    const poll = async () => {
      try {
        const result = status.parse(await apiRequest(`/api/conversions/${id}`))
        if (cancelled) return
        setState({ source, progress: result.progress, url: result.status === 'ready' ? `${API_BASE_URL}/api/conversions/${id}/media` : undefined, error: result.status === 'failed' ? result.error ?? 'Conversion failed' : undefined })
        if (result.status !== 'failed') timer = setTimeout(poll, result.status === 'ready' ? 60_000 : 1000)
      } catch (error) { if (!cancelled) setState({ source, progress: 0, error: error instanceof Error ? error.message : 'Conversion failed' }) }
    }
    void apiRequest('/api/conversions', { method: 'POST', body: { url: source } }).then(value => {
      id = created.parse(value).id
      if (cancelled) release(); else void poll()
    }).catch(error => { if (!cancelled) setState({ source, progress: 0, error: error instanceof Error ? error.message : 'Conversion failed' }) })
    return () => { cancelled = true; clearTimeout(timer); release() }
  }, [enabled, source])
  const current = enabled && state && state.source === source ? state : null
  return { enabled, progress: current?.progress ?? 0, url: current?.url, error: current?.error }
}
