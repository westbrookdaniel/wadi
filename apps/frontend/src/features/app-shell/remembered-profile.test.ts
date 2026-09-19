import { beforeEach, expect, it } from 'vitest'
import { rememberedProfile, rememberProfile } from './remembered-profile'
beforeEach(() => localStorage.clear())
it('keeps the selected profile across tab sessions and separate for each account', () => {
  rememberProfile('alice', 'alice-kids')
  rememberProfile('bob', 'bob-main')
  sessionStorage.clear()
  expect(rememberedProfile('alice')).toBe('alice-kids')
  expect(rememberedProfile('bob')).toBe('bob-main')
  expect(rememberedProfile('new-account')).toBeNull()
})
