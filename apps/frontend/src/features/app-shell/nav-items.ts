import {
  Clapperboard,
  Home,
  Plus,
  Search,
  Tv,
  User,
} from 'lucide-react'

export const navItems = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/watchlists', label: 'Watchlists', icon: Plus },
  { path: '/movies', label: 'Movies', icon: Clapperboard },
  { path: '/series', label: 'Series', icon: Tv },
  { path: '/settings', label: 'Settings', icon: User },
] as const

export type NavPath = (typeof navItems)[number]['path']
