'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, ChevronDown, ArrowUpDown } from 'lucide-react'
import { type Player, changePct, formatNumber, formatPct } from '@/lib/market-data'
import { cn } from '@/lib/utils'
import { StatusBadge } from './status-badge'

type MarketBoardProps = {
  players: Player[]
  selectedId: string
  onSelect: (id: string) => void
}

const POSITIONS = ['All', 'GK', 'DEF', 'MID', 'FWD'] as const
type PositionFilter = typeof POSITIONS[number]
type SortKey = 'price' | 'change' | 'name'
type FlashDir = 'up' | 'down'

export function MarketBoard({ players, selectedId, onSelect }: MarketBoardProps) {
  const [query, setQuery]       = useState('')
  const [position, setPosition] = useState<PositionFilter>('All')
  const [club, setClub]         = useState('All')
  const [sortKey, setSortKey]   = useState<SortKey>('price')
  const [sortAsc, setSortAsc]   = useState(false)
  const [clubOpen, setClubOpen] = useState(false)
  const [flashMap, setFlashMap] = useState<Map<string, FlashDir>>(new Map())
  const prevPrices = useRef<Map<string, number>>(new Map())
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Detect price changes and trigger flash
  useEffect(() => {
    const newFlash = new Map<string, FlashDir>()
    for (const p of players) {
      const prev = prevPrices.current.get(p.id)
      if (prev !== undefined && prev !== p.price) {
        newFlash.set(p.id, p.price > prev ? 'up' : 'down')
      }
      prevPrices.current.set(p.id, p.price)
    }
    if (newFlash.size === 0) return

    setFlashMap(prev => {
      const next = new Map(prev)
      for (const [id, dir] of newFlash) next.set(id, dir)
      return next
    })

    for (const id of newFlash.keys()) {
      const existing = flashTimers.current.get(id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        setFlashMap(prev => {
          const next = new Map(prev)
          next.delete(id)
          return next
        })
        flashTimers.current.delete(id)
      }, 1500)
      flashTimers.current.set(id, timer)
    }
  }, [players])

  const clubs = useMemo(() => {
    const set = new Set(players.map(p => p.club))
    return ['All', ...Array.from(set).sort()]
  }, [players])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = players.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.club.toLowerCase().includes(q) && !p.tickerName.toLowerCase().includes(q)) return false
      if (position !== 'All' && p.position !== position) return false
      if (club !== 'All' && p.club !== club) return false
      return true
    })
    list = [...list].sort((a, b) => {
      let diff = 0
      if (sortKey === 'price')  diff = a.price - b.price
      if (sortKey === 'change') diff = changePct(a) - changePct(b)
      if (sortKey === 'name')   diff = a.name.localeCompare(b.name)
      return sortAsc ? diff : -diff
    })
    return list
  }, [players, query, position, club, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown className={cn('inline size-3 ml-0.5', sortKey === k ? 'text-foreground' : 'text-muted-foreground/40')} />
  )

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="market-board-title">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="market-board-title" className="font-mono text-xs font-semibold tracking-widest text-foreground">
          PLAYER MARKET BOARD
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} LISTED</span>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3 pb-2">
        <label htmlFor="player-search" className="sr-only">Search players</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="player-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, club or ticker"
            className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 border-b border-border px-3 py-2">
        {/* Position pills */}
        <div className="flex gap-1">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              className={cn(
                'rounded-sm px-2 py-1 font-mono text-[10px] font-semibold transition-colors',
                position === pos
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Club dropdown */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setClubOpen(o => !o)}
            className="flex h-7 items-center gap-1 rounded-sm border border-border bg-secondary px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            <span className="max-w-[80px] truncate">{club === 'All' ? 'All Clubs' : club}</span>
            <ChevronDown className="size-3 shrink-0" />
          </button>
          {clubOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 max-h-56 w-48 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
              {clubs.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setClub(c); setClubOpen(false) }}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left font-mono text-[11px] hover:bg-accent',
                    club === c ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border font-mono text-[10px] tracking-wider whitespace-nowrap text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                <button type="button" onClick={() => toggleSort('name')} className="hover:text-foreground">
                  PLAYER <SortIcon k="name" />
                </button>
              </th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort('price')} className="hover:text-foreground">
                  PRICE <SortIcon k="price" />
                </button>
              </th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">
                <button type="button" onClick={() => toggleSort('change')} className="hover:text-foreground">
                  24H <SortIcon k="change" />
                </button>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const pct = changePct(p)
              const selected = p.id === selectedId
              const flash = flashMap.get(p.id)
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    'cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/60',
                    selected && 'bg-accent shadow-[inset_2px_0_0_0_var(--gain)]',
                  )}
                >
                  <td className="max-w-0 w-full py-2 pr-1 pl-3">
                    <button
                      type="button"
                      aria-pressed={selected}
                      title={p.name}
                      onClick={e => { e.stopPropagation(); onSelect(p.id) }}
                      className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {p.club} · {p.position}
                      </span>
                    </button>
                  </td>
                  <td className={cn(
                    'px-1.5 py-2 text-right font-mono text-sm whitespace-nowrap tabular-nums transition-colors duration-300',
                    flash === 'up' ? 'text-gain' : flash === 'down' ? 'text-loss' : 'text-foreground',
                  )}>
                    {formatNumber(p.price)}
                  </td>
                  <td className={cn('px-1.5 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}>
                    {formatPct(pct)}
                  </td>
                  <td className="py-2 pr-3 pl-1.5 text-right">
                    <StatusBadge status={p.status} compact />
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No players match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-gain" aria-hidden="true" /> Active</span>
        <span className="flex items-center gap-1.5 text-lock">⚠ Injured</span>
        <span className="flex items-center gap-1.5 text-loss">⊘ Suspended</span>
      </div>
    </section>
  )
}
