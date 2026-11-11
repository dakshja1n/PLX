export type PlayerStatus = 'active' | 'injured' | 'suspended'

export type Player = {
  id: string
  name: string
  tickerName: string
  club: string
  nationality: string
  position: string
  price: number
  open: number
  marketValue: number
  status: PlayerStatus
}

export type Holding = {
  playerId: string
  shares: number
  avgPrice: number
}

export type TradeSide = 'BUY' | 'SELL'

export type Trade = {
  id: string
  timestamp: string
  side: TradeSide
  playerId: string
  shares: number
  price: number
  fee: number
  status: 'FILLED' | 'REJECTED'
}

export type Timeframe = '1D' | '1W' | '1M' | '1Y' | 'ALL'

export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y', 'ALL']

export const FEE_RATE = 0.005
export const INITIAL_CASH = 10_000

type PlayerSeed = Omit<Player, 'open'> & { change24h: number }

const seeds: PlayerSeed[] = [
  { id: 'salah',     name: 'Mohamed Salah',     tickerName: 'SLAH', club: 'Liverpool',      nationality: 'EGY', position: 'RW',  price: 85.00,  change24h:  1.2, status: 'active',    marketValue: 85_000_000 },
  { id: 'haaland',   name: 'Erling Haaland',    tickerName: 'HAAL', club: 'Man City',        nationality: 'NOR', position: 'ST',  price: 180.00, change24h:  0.5, status: 'active',    marketValue: 180_000_000 },
  { id: 'palmer',    name: 'Cole Palmer',        tickerName: 'PALM', club: 'Chelsea',         nationality: 'ENG', position: 'AM',  price: 100.00, change24h:  2.1, status: 'active',    marketValue: 100_000_000 },
  { id: 'saka',      name: 'Bukayo Saka',        tickerName: 'SAKA', club: 'Arsenal',         nationality: 'ENG', position: 'RW',  price: 150.00, change24h: -0.3, status: 'active',    marketValue: 150_000_000 },
  { id: 'mbappe',    name: 'Kylian Mbappé',      tickerName: 'MBAP', club: 'Real Madrid',     nationality: 'FRA', position: 'LW',  price: 180.00, change24h:  0.0, status: 'active',    marketValue: 180_000_000 },
  { id: 'vinicius',  name: 'Vinícius Jr.',       tickerName: 'VINI', club: 'Real Madrid',     nationality: 'BRA', position: 'LW',  price: 180.00, change24h:  0.8, status: 'active',    marketValue: 180_000_000 },
  { id: 'odegaard',  name: 'Martin Ødegaard',    tickerName: 'ODEG', club: 'Arsenal',         nationality: 'NOR', position: 'AM',  price: 120.00, change24h: -1.0, status: 'injured',   marketValue: 120_000_000 },
  { id: 'rashford',  name: 'Marcus Rashford',    tickerName: 'RASH', club: 'Man United',      nationality: 'ENG', position: 'LW',  price: 45.00,  change24h: -2.4, status: 'active',    marketValue: 45_000_000 },
  { id: 'trent',     name: 'Trent Alexander-Arnold', tickerName: 'TREN', club: 'Real Madrid', nationality: 'ENG', position: 'RB',  price: 80.00,  change24h:  0.4, status: 'active',    marketValue: 80_000_000 },
  { id: 'isak',      name: 'Alexander Isak',     tickerName: 'ISAK', club: 'Newcastle',       nationality: 'SWE', position: 'ST',  price: 110.00, change24h:  1.8, status: 'active',    marketValue: 110_000_000 },
]

export const INITIAL_PLAYERS: Player[] = seeds.map(({ change24h, ...p }) => ({
  ...p,
  open: Math.round((p.price / (1 + change24h / 100)) * 100) / 100,
}))

export const INITIAL_HOLDINGS: Holding[] = [
  { playerId: 'salah',   shares: 5, avgPrice: 82.50 },
  { playerId: 'haaland', shares: 2, avgPrice: 175.00 },
]

export const INITIAL_TRADES: Trade[] = [
  { id: 't-1003', timestamp: '2026-11-10 14:22:09', side: 'BUY', playerId: 'haaland', shares: 2, price: 175.00, fee: 1.75, status: 'FILLED' },
  { id: 't-1002', timestamp: '2026-11-09 10:05:55', side: 'BUY', playerId: 'salah',   shares: 3, price: 81.00,  fee: 1.22, status: 'FILLED' },
  { id: 't-1001', timestamp: '2026-11-08 16:41:33', side: 'BUY', playerId: 'salah',   shares: 2, price: 84.00,  fee: 0.84, status: 'FILLED' },
]

const TIMEFRAME_CONFIG: Record<Timeframe, { points: number; volatility: number; label: (i: number) => string }> = {
  '1D': { points: 48, volatility: 0.8,  label: (i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}` },
  '1W': { points: 42, volatility: 2.0,  label: (i) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.floor(i / 6)] },
  '1M': { points: 30, volatility: 4.0,  label: (i) => `Oct ${i + 3 > 31 ? i - 28 : i + 3}` },
  '1Y': { points: 52, volatility: 8.0,  label: (i) => `W${i + 1}` },
  ALL:  { points: 60, volatility: 15.0, label: (i) => `${2020 + Math.floor(i / 12)}` },
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function hashString(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

export type ChartPoint = { label: string; price: number }

export function buildHistory(player: Player, timeframe: Timeframe): ChartPoint[] {
  const { points, volatility, label } = TIMEFRAME_CONFIG[timeframe]
  const rand = seededRandom(hashString(player.id + timeframe))
  const steps: number[] = []
  for (let i = 0; i < points - 1; i++) steps.push((rand() - 0.47) * volatility)

  const series: number[] = [player.price]
  for (let i = steps.length - 1; i >= 0; i--) series.unshift(series[0] - steps[i])

  return series.map((price, i) => ({
    label: label(i),
    price: Math.round(price * 100) / 100,
  }))
}

export const formatUSD = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatNumber = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

export const changePct = (player: Player) => ((player.price - player.open) / player.open) * 100

export function formatTimestamp(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
