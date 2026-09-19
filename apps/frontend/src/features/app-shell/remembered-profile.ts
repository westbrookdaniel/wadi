const key = (userId: string) => `wadi.profile.last.${userId}`
export function rememberedProfile(userId: string): string | null {
  try { return localStorage.getItem(key(userId)) } catch { return null }
}
export function rememberProfile(userId: string, profileId: string) {
  try { localStorage.setItem(key(userId), profileId) } catch { /* Keep the active session usable without storage. */ }
}
