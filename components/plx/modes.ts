import { House, Trophy, TrendingUp, type LucideIcon } from 'lucide-react'

export type ModeId = 'home' | 'spot' | 'leaderboard'

export type ModeConfig = {
  id: ModeId
  short: string
  label: string
  tag: string | null
  status: 'active' | 'phase'
  icon: LucideIcon
  title: string
  description: string
}

export const MODES: ModeConfig[] = [
  {
    id: 'home',
    short: 'Home',
    label: 'Home Hub',
    tag: null,
    status: 'active',
    icon: House,
    title: 'Home Hub',
    description: 'Overview of your account, game modes, and holdings.',
  },
  {
    id: 'spot',
    short: 'M1',
    label: 'Spot Desk',
    tag: 'Active',
    status: 'active',
    icon: TrendingUp,
    title: 'Mode 1: Spot Exchange',
    description: 'Trade Premier League player shares with 0.5% fees.',
  },
  {
    id: 'leaderboard',
    short: 'LB',
    label: 'Leaderboard',
    tag: 'Live',
    status: 'active',
    icon: Trophy,
    title: 'Leaderboard',
    description: 'Ranked net worth across all PlX traders.',
  },
]
