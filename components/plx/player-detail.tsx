'use client'

import { type ChartPoint, type Player, type Timeframe, TIMEFRAMES, changePct, formatPct, formatUSD } from '@/lib/market-data'
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
  const flatLine: ChartPoint[] = [
    { label: 'Base', price: player.price },
    { label: 'Now',  price: player.price },
  ]
  const data: ChartPoint[] = priceHistory && priceHistory.length >= 2 ? priceHistory : flatLine

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="player-name">

      {/* Header: name left, price right — price is the number that matters */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 pt-0.5">
            <h2 id="player-name" className="text-base font-semibold text-foreground leading-tight">
              {player.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {player.club}
              <span className="mx-1.5 text-border">·</span>
              {player.position}
              <span className="mx-1.5 text-border">·</span>
              <span className="font-mono">{player.tickerName}</span>
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="font-mono text-2xl font-semibold text-foreground tabular-nums leading-none">
              {formatUSD(player.price)}
            </p>
            <p className={cn('mt-1.5 font-mono text-xs tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}>
              {pnl >= 0 ? '+' : ''}{formatUSD(pnl)}
              <span className="ml-1 opacity-70">{formatPct(pct)}</span>
            </p>
            <div className="mt-1.5 flex justify-end">
              <StatusBadge status={player.status} />
            </div>
          </div>
        </div>

        {/* Stats as a plain inline row — no boxes */}
        <dl className="mt-3 flex items-center gap-5 font-mono text-xs">
          <div>
            <dt className="text-[9px] tracking-widest text-muted-foreground">MKT VALUE</dt>
            <dd className="mt-0.5 font-medium text-foreground">${(player.marketValue / 1_000_000).toFixed(0)}M</dd>
          </div>
          <div className="h-3 w-px bg-border" aria-hidden="true" />
          <div>
            <dt className="text-[9px] tracking-widest text-muted-foreground">CLUB</dt>
            <dd className="mt-0.5 font-medium text-foreground">{player.club}</dd>
          </div>
          <div className="h-3 w-px bg-border" aria-hidden="true" />
          <div>
            <dt className="text-[9px] tracking-widest text-muted-foreground">NAT.</dt>
            <dd className="mt-0.5 font-medium text-foreground">{player.nationality}</dd>
          </div>
        </dl>
      </div>

      {/* Timeframe selector — right-aligned, minimal */}
      <div className="flex shrink-0 items-center justify-end gap-0.5 px-4 pt-2 pb-0">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => onTimeframeChange(tf)}
            aria-pressed={tf === timeframe}
            className={cn(
              'rounded-sm px-2 py-1 font-mono text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tf === timeframe
                ? 'text-foreground bg-secondary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart — fills remaining space */}
      <div className="flex min-h-0 flex-1 px-1 pt-1 pb-2">
        <PriceChart data={data} />
      </div>
    </section>
  )
}
