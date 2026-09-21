import { queryOptions } from '@tanstack/react-query'
import { apiRequest } from './client'
export type IntroDbPreferences = { enabled: boolean }
export const introDbPreferencesQuery = (accountRevision: number) => queryOptions({
  queryKey: ['introdb-preferences', accountRevision],
  queryFn: ({ signal }) => apiRequest<IntroDbPreferences>('/api/settings/introdb', { signal }),
  staleTime: 0,
  retry: false,
})
export const updateIntroDbPreferences = (enabled: boolean) =>
  apiRequest<IntroDbPreferences>('/api/settings/introdb', { method: 'PUT', body: { enabled } })
