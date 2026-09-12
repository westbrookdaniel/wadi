import { useEffect } from 'react'
import { useDeviceStore } from '@/store/device-store'

export function ThemeSync() {
  const theme = useDeviceStore(state => state.theme)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      document.body.classList.remove('dark')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#090b0d' : '#ffffff')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return null
}
