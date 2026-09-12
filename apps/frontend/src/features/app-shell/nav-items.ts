import {
  Compass,
  Home,
  Plus,
  Search,
  User,
} from 'lucide-react'

export const navItems = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/watchlists', label: 'Watchlists', icon: Plus },
  { path: '/discover', label: 'Discover', icon: Compass },
  { path: '/settings', label: 'Settings', icon: User },
] as const

export type NavPath = (typeof navItems)[number]['path']
