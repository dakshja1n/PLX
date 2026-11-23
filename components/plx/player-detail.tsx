'use client'

import { useMemo } from 'react'
import { Flag, Info, Shirt, Star } from 'lucide-react'
import { type ChartPoint, type Player, type Timeframe, TIMEFRAMES, buildHistory, changePct, formatPct, formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'
import { PriceChart } from './price-chart'
import { StatusBadge } from './status-badge'

type PlayerDetailProps = {
  player: Player
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
  priceHistory?: ChartPoint[]
}

export function PlayerDetail({ player, timeframe, onTimeframeChange, priceHistory }: PlayerDetailProps) {
  const pct = changePct(player)
  const pnl = player.price - player.open
  const generatedData = useMemo(() => buildHistory(player, timeframe), [player, timeframe])
  const data: ChartPoint[] = priceHistory && priceHistory.length >= 2 ? priceHistory : generatedData

  const stats = [
    { label: 'MARKET VALUE', value: `$${(player.marketValue / 1_000_000).toFixed(0)}M`, icon: Star },
    { label: 'CLUB', value: player.club, icon: Shirt },
    { label: 'NATIONALITY', value: player.nationality, icon: Flag },
  ]

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="player-name">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="player-name" className="text-xl font-semibold tracking-tight text-foreground text-balance">
              {player.name}
            </h2>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground ring-1 ring-border">
              {player.tickerName}
            </span>
            <StatusBadge status={player.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{player.club} · {player.position}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground">SHARE PRICE</p>
          <p className="font-mono text-3xl font-semibold text-foreground tabular-nums">{formatUSD(player.price)}</p>
          <p className={cn('font-mono text-xs tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}>
            {pnl >= 0 ? '+' : '-'}
            {formatUSD(Math.abs(pnl))} ({formatPct(pct)}) <span className="text-muted-foreground">24H</span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between px-5 pt-3">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">PRICE HISTORY</p>
        <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              aria-pressed={tf === timeframe}
              className={cn(
                'rounded-sm px-2.5 py-1 font-mono text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tf === timeframe ? 'bg-gain/15 text-gain' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-2 pb-3">
        <PriceChart data={data} />
      </div>

      <dl className="grid shrink-0 grid-cols-3 gap-3 px-5">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-md border border-border bg-background px-3 py-2.5">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted-foreground">
              <Icon className="size-3" aria-hidden="true" />
              {label}
            </dt>
            <dd className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="m-4 mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-md border border-gain/25 bg-gain/5 px-3 py-2 text-xs text-foreground">
        <Info className="size-4 shrink-0 text-gain" aria-hidden="true" />
        <p>
          Market value drives share price. Prices update as{' '}
          <span className="font-mono font-semibold text-gain">match results</span> come in.
        </p>
      </div>
    </section>
  )
}
