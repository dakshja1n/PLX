'use client'

import { ArrowUpRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { type ChartPoint, type Holding, type Player, type ShortPosition, type Trade, formatPct, formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'
import { MODES, type ModeId } from './modes'
import { PortfolioPanel } from './portfolio-panel'

type HomeHubProps = {
  players: Player[]
  holdings: Holding[]
  trades: Trade[]
  shortPositions: ShortPosition[]
  cash: number
  holdingsValue: number
  pnl24h: number
  displayName: string
  netWorthHistory: ChartPoint[]
  onModeChange: (mode: ModeId) => void
  onQuickSell: (playerId: string) => void
  onQuickCover: (playerId: string) => void
}

export function HomeHub({ players, holdings, trades, shortPositions, cash, holdingsValue, pnl24h, displayName, netWorthHistory, onModeChange, onQuickSell, onQuickCover }: HomeHubProps) {
  const netWorth = cash + holdingsValue
  const pnlPct = holdingsValue - pnl24h > 0 ? (pnl24h / (holdingsValue - pnl24h)) * 100 : 0
  const pnlPositive = pnl24h >= 0
  const gameModes = MODES.filter((m) => m.id !== 'home')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      {/* Top band — net worth dominant */}
      <section className="shrink-0 border-b border-border bg-card px-6 py-5" aria-label="Portfolio overview">
        <div className="flex items-end justify-between gap-8">
          {/* Left: dominant number */}
          <div>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">NET WORTH</p>
            <p className="font-mono text-4xl font-semibold tabular-nums text-foreground leading-none">
              {formatUSD(netWorth)}
            </p>
            <p className={cn('mt-2 font-mono text-sm tabular-nums', pnlPositive ? 'text-gain' : 'text-loss')}>
              {pnlPositive ? '+' : ''}{formatUSD(pnl24h)}
              <span className="ml-1.5 text-muted-foreground text-xs">{formatPct(pnlPct)} today</span>
            </p>
          </div>

          {/* Right: secondary stats — no boxes, just ruled columns */}
          <dl className="flex items-end gap-8 font-mono pb-0.5">
            <div className="text-right">
              <dt className="text-[10px] tracking-widest text-muted-foreground mb-1">CASH</dt>
              <dd className="text-base font-medium text-foreground tabular-nums">{formatUSD(cash)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] tracking-widest text-muted-foreground mb-1">HOLDINGS</dt>
              <dd className="text-base font-medium text-foreground tabular-nums">{formatUSD(holdingsValue)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] tracking-widest text-muted-foreground mb-1">POSITIONS</dt>
              <dd className="text-base font-medium text-foreground tabular-nums">{holdings.length + shortPositions.length}</dd>
            </div>
          </dl>
        </div>

        {/* Sparkline — only when real history exists */}
        {netWorthHistory.length >= 2 && (
          <div className="mt-4 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netWorthHistory} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <YAxis domain={['dataMin - 100', 'dataMax + 100']} hide />
                <Tooltip
                  contentStyle={{ background: '#0c1120', border: '1px solid #1a2235', borderRadius: 2, fontFamily: 'var(--font-geist-mono)', fontSize: 11 }}
                  labelStyle={{ color: '#6b7a94' }}
                  itemStyle={{ color: '#22c55e' }}
                  formatter={(v) => [formatUSD(Number(v)), 'Net worth']}
                />
                <Area type="monotone" dataKey="price" stroke="#22c55e" strokeWidth={1.5} fill="url(#nwFill)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Mode cards — no coloured borders, action weight carries them */}
      <section aria-label="Modes" className="shrink-0 grid grid-cols-2 gap-px border-b border-border bg-border">
        {gameModes.map((m) => {
          const Icon = m.icon
          const active = m.status === 'active'
          return (
            <article key={m.id} className="flex flex-col gap-3 bg-card px-5 py-4">
              <div className="flex items-center justify-between">
                <div className={cn('flex size-7 items-center justify-center rounded-sm', active ? 'bg-gain/10' : 'bg-secondary')}>
                  <Icon className={cn('size-3.5', active ? 'text-gain' : 'text-muted-foreground')} aria-hidden="true" />
                </div>
                <span className={cn('font-mono text-[9px] font-medium tracking-widest', active ? 'text-gain' : 'text-muted-foreground/50')}>
                  {active ? 'LIVE' : m.tag ?? 'SOON'}
                </span>
              </div>
              <div>
                <h2 className={cn('text-sm font-semibold', active ? 'text-foreground' : 'text-muted-foreground')}>{m.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onModeChange(m.id)}
                className={cn(
                  'mt-auto flex h-7 items-center justify-center gap-1 rounded-sm text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-gain text-black hover:bg-gain/90'
                    : 'border border-border text-muted-foreground/60 cursor-default',
                )}
                disabled={!active}
              >
                {active ? (
                  <><span>Open</span><ArrowUpRight className="size-3" aria-hidden="true" /></>
                ) : 'Coming soon'}
              </button>
            </article>
          )
        })}
      </section>

      {/* Portfolio table */}
      <div className="flex min-h-0 flex-1 flex-col">
        <PortfolioPanel
          players={players}
          holdings={holdings}
          trades={trades}
          shortPositions={shortPositions}
          onQuickSell={onQuickSell}
          onQuickCover={onQuickCover}
          title="PORTFOLIO"
        />
      </div>
    </div>
  )
}
