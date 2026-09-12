import '@fontsource-variable/geist'
import { TvNavigation } from '@/components/tv-navigation'
import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ToastProvider } from '@/components/ui/toast'
import { DialogManagerProvider } from '@/components/dialogs'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

export default function WadiApp() { return (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <DialogManagerProvider>
            <TvNavigation /><RouterProvider router={router} />
          </DialogManagerProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
) }
