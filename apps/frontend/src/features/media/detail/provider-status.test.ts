import { expect, it } from 'vitest'
import { placeholderReason } from './provider-status'
it('rejects short provider notices while preserving full videos and unknown short videos', () => {
  expect(placeholderReason({ name: 'Comet [TB⬇️]' }, 8)).toContain('not cached yet')
  expect(placeholderReason({ description: '1 GB' }, 8)).toContain('short provider notice')
  expect(placeholderReason({ description: '1 GB' }, 7200)).toBeNull()
  expect(placeholderReason({}, 8)).toBeNull()
  expect(placeholderReason({}, Infinity)).toBeNull()
})
