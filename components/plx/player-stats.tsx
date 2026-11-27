'use client'

import { useEffect, useState } from 'react'
import { type PerformanceHistoryRow, formatUSD } from '@/lib/market-data'
import { fetchPlayerPerformanceHistory } from '@/lib/supabase/queries'
import { cn } from '@/lib/utils'

type PlayerStatsProps = {
  playerId: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const th = 'px-3 py-2 font-medium whitespace-nowrap text-left'
const td = 'px-3 py-2 whitespace-nowrap'

export function PlayerStats({ playerId }: PlayerStatsProps) {
  const [rows, setRows] = useState<PerformanceHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlayerPerformanceHistory(playerId)
      .then((data) => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(e?.message ?? 'Failed to load'); setLoading(false) } })
    return () => { cancelled = true }
  }, [playerId])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="font-mono text-sm text-muted-foreground">Loading match history...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="font-mono text-sm text-loss">{error}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="font-mono text-sm text-muted-foreground text-center">
          No match history yet. Data accumulates from nightly price updates.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border font-mono text-[10px] tracking-widest text-muted-foreground">
            <th scope="col" className={th}>DATE</th>
            <th scope="col" className={th}>OPPONENT</th>
            <th scope="col" className={cn(th, 'text-right')}>POINTS</th>
            <th scope="col" className={cn(th, 'text-right')}>PRICE CHG</th>
            <th scope="col" className={cn(th, 'text-right')}>G</th>
            <th scope="col" className={cn(th, 'text-right')}>A</th>
            <th scope="col" className={cn(th, 'text-right')}>RTG</th>
          </tr>
        </thead>
        <tbody className="font-mono text-sm">
          {rows.map((row) => {
            const priceDelta = row.price_after - row.price_before
            const positive = priceDelta >= 0
            const points = (row.raw_points * row.competition_weight).toFixed(1)
            const m = row.match_data

            return (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className={cn(td, 'text-xs text-muted-foreground tabular-nums')}>
                  {formatDate(row.recorded_at)}
                </td>
                <td className={td}>
                  <span className="text-foreground">{m?.opponent ?? 'Unknown'}</span>
                  {m?.result && (
                    <span className={cn(
                      'ml-2 text-xs',
                      m.result.endsWith('W') ? 'text-gain' : m.result.endsWith('L') ? 'text-loss' : 'text-muted-foreground',
                    )}>
                      {m.result}
                    </span>
                  )}
                </td>
                <td className={cn(td, 'text-right tabular-nums', Number(points) >= 0 ? 'text-gain' : 'text-loss')}>
                  {Number(points) >= 0 ? '+' : ''}{points}
                </td>
                <td className={cn(td, 'text-right tabular-nums', positive ? 'text-gain' : 'text-loss')}>
                  {positive ? '+' : ''}{formatUSD(priceDelta)}
                </td>
                <td className={cn(td, 'text-right tabular-nums', m?.goals ? 'text-foreground' : 'text-muted-foreground/50')}>
                  {m?.goals ?? 0}
                </td>
                <td className={cn(td, 'text-right tabular-nums', m?.assists ? 'text-foreground' : 'text-muted-foreground/50')}>
                  {m?.assists ?? 0}
                </td>
                <td className={cn(td, 'text-right tabular-nums', (m?.rating ?? 0) >= 7 ? 'text-gain' : (m?.rating ?? 0) >= 5 ? 'text-foreground' : 'text-muted-foreground/50')}>
                  {m?.rating ? m.rating.toFixed(1) : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
