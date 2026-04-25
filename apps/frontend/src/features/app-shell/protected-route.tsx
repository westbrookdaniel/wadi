import { Navigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import type { User } from '@/api/types'
import { meQuery } from '@/api/queries'
import { LoadingState } from '@/components/status'
import { appBackground } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { clearStoredToken, useAppStore } from '@/store/app-store'

export function ProtectedRoute({ children }: { children: (user: User) => ReactNode }) {
  const token = useAppStore((state) => state.token)
  const me = useQuery(meQuery(Boolean(token)))

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (me.isLoading) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Restoring session" />
      </main>
    )
  }

  if (me.isError) {
    return <InvalidSessionRedirect />
  }

  if (!me.data) {
    return (
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Preparing app" />
      </main>
    )
  }

  return children(me.data)
}

function InvalidSessionRedirect() {
  useEffect(() => {
    clearStoredToken()
  }, [])

  return <Navigate to="/login" replace />
}
