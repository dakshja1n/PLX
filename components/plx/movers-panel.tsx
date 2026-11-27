'use client'

import { type Player, changePct, formatPct, formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'

type MoversPanelProps = {
  players: Player[]
  onSelect: (id: string) => void
}

type Tab = 'price-up' | 'price-down' | 'demand-up' | 'demand-down'

const TABS: { id: Tab; label: string }[] = [
  { id: 'price-up',    label: 'Price +' },
  { id: 'price-down',  label: 'Price -' },
  { id: 'demand-up',   label: 'Demand +' },
  { id: 'demand-down', label: 'Demand -' },
]

function sortedPlayers(players: Player[], tab: Tab): Player[] {
  const copy = [...players]
  if (tab === 'price-up')    return copy.sort((a, b) => changePct(b) - changePct(a)).slice(0, 10)
  if (tab === 'price-down')  return copy.sort((a, b) => changePct(a) - changePct(b)).slice(0, 10)
  if (tab === 'demand-up')   return copy.sort((a, b) => b.netVolume7d - a.netVolume7d).slice(0, 10)
  return copy.sort((a, b) => a.netVolume7d - b.netVolume7d).slice(0, 10)
}

import { useState } from 'react'

export function MoversPanel({ players, onSelect }: MoversPanelProps) {
  const [tab, setTab] = useState<Tab>('price-up')
  const rows = sortedPlayers(players, tab)
  const isDemand = tab === 'demand-up' || tab === 'demand-down'
  const isPositive = tab === 'price-up' || tab === 'demand-up'

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card" aria-label="Market movers">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-border" role="tablist" aria-label="Mover categories">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex h-9 flex-1 items-center justify-center font-mono text-[10px] font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === t.id
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-gain'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="shrink-0 grid grid-cols-[1fr_auto] border-b border-border px-3 py-1.5 font-mono text-[9px] tracking-widest text-muted-foreground">
        <span>PLAYER</span>
        <span className="text-right">{isDemand ? 'VOL 7D' : '24H'}</span>
      </div>

      {/* Rows */}
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((p, i) => {
          const pct = changePct(p)
          const vol = p.netVolume7d
          const positive = isPositive

          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring last:border-0"
              >
                <span className="font-mono text-[10px] text-muted-foreground/50 w-4 tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-foreground truncate">{p.tickerName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.name}</p>
                </div>
                <div className="text-right">
                  {isDemand ? (
                    <span className={cn('font-mono text-xs font-semibold tabular-nums', positive ? 'text-gain' : 'text-loss')}>
                      {vol > 0 ? '+' : ''}{vol.toLocaleString()}
                    </span>
                  ) : (
                    <>
                      <p className={cn('font-mono text-xs font-semibold tabular-nums', positive ? 'text-gain' : 'text-loss')}>
                        {formatPct(pct)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">{formatUSD(p.price)}</p>
                    </>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
