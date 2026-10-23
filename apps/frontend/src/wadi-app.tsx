import { AppKeyboardShortcuts } from '@/components/app-keyboard-shortcuts'
import '@fontsource-variable/geist/index.css'
import { TvNavigation } from '@/components/tv-navigation'
import { useAppStore } from '@/store/app-store'
import { StrictMode, useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ToastProvider } from '@/components/ui/toast'
import { DialogManagerProvider } from '@/components/dialogs'

function createQueryClient() { return new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
}) }

export default function WadiApp() {
  const profileId = useAppStore(state => state.activeProfileId)
  const revision = useAppStore(state => state.authRevision)
  const scope = JSON.stringify([revision, profileId])
  const queryClient = useMemo(() => { void scope; return createQueryClient() }, [scope])
  useEffect(() => () => { void queryClient.cancelQueries(); queryClient.clear() }, [queryClient])
  return (
  <StrictMode>
    <QueryClientProvider key={scope} client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <DialogManagerProvider>
            <AppKeyboardShortcuts /><TvNavigation /><RouterProvider router={router} />
          </DialogManagerProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
) }
