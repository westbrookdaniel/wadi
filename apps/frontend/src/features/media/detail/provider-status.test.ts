import { expect, it } from 'vitest'
import { cacheStatus, placeholderReason } from './provider-status'
it('distinguishes Comet download rows from cached rows and unknown providers', () => {
  expect(cacheStatus({ name: 'Comet [TB⬇️]' })).toBe('uncached')
  expect(cacheStatus({ name: 'Comet [TB⚡]' })).toBe('cached')
  expect(cacheStatus({ name: 'Comet' })).toBeNull()
  expect(cacheStatus({ title: 'Not cached ⚡' })).toBe('uncached')
})
it('rejects short provider notices while preserving full videos and unknown short videos', () => {
  expect(placeholderReason({ name: 'Comet [TB⬇️]' }, 8)).toContain('not cached yet')
  expect(placeholderReason({ description: '1 GB' }, 8)).toContain('short provider notice')
  expect(placeholderReason({ description: '1 GB' }, 7200)).toBeNull()
  expect(placeholderReason({}, 8)).toBeNull()
  expect(placeholderReason({}, Infinity)).toBeNull()
})
