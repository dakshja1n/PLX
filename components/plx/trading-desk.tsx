'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { executeTrade, fetchHoldings, fetchPlayers, fetchPortfolio, fetchProfile, fetchTrades } from '@/lib/supabase/queries'
import {
  INITIAL_PLAYERS,
  type ChartPoint,
  type Holding,
  type Player,
  type Timeframe,
  type Trade,
  type TradeSide,
  buildHistory,
  formatTimestamp,
} from '@/lib/market-data'
import { HeaderBar } from './header-bar'
import { HomeHub } from './home-hub'
import { LeaderboardView } from './leaderboard-view'
import { MarketBoard } from './market-board'
import { MODES, type ModeId } from './modes'
import { OrderTicket } from './order-ticket'
import { PlayerDetail } from './player-detail'
import { RoadmapView } from './roadmap-view'

function dbPlayerToPlayer(p: Record<string, unknown>): Player {
  return {
    id: p.id as string,
    name: p.name as string,
    tickerName: (p.ticker_name as string) ?? (p.name as string).split(' ').pop() ?? '',
    club: (p.club as string) ?? '—',
    nationality: (p.nationality as string) ?? '—',
    position: (p.position as string) ?? '—',
    price: Number(p.price),
    open: Number(p.price) - Number(p.price_change_24h ?? 0),
    marketValue: Number(p.market_value ?? 0),
    status: (p.status as string) === 'injured' ? 'injured' : (p.status as string) === 'suspended' ? 'suspended' : 'active',
  }
}

function dbHoldingToHolding(h: Record<string, unknown>): Holding {
  return {
    playerId: h.player_id as string,
    shares: Number(h.shares),
    avgPrice: Number(h.avg_cost),
  }
}

function dbTradeToTrade(t: Record<string, unknown>): Trade {
  return {
    id: t.id as string,
    timestamp: formatTimestamp(new Date(t.executed_at as string)),
    side: t.side as TradeSide,
    playerId: t.player_id as string,
    shares: Number(t.shares),
    price: Number(t.price),
    fee: Number(t.fee),
    status: 'FILLED',
  }
}

export function TradingDesk() {
  const [mode, setMode] = useState<ModeId>('spot')
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS)
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL_PLAYERS[0]?.id ?? null)
  const [cash, setCash] = useState(10_000)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [side, setSide] = useState<TradeSide>('BUY')
  const [sharesInput, setSharesInput] = useState('1')
  const [timeframe, setTimeframe] = useState<Timeframe>('1D')
  const [notice, setNotice] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('Trader')
  const [loading, setLoading] = useState(true)
  const [priceHistoryCache] = useState<Map<string, ChartPoint[]>>(new Map())
  const fetchingHistory = useRef<Set<string>>(new Set())

  const reload = useCallback(async (uid: string) => {
    try {
      const [dbPlayers, portfolio, dbHoldings, dbTrades] = await Promise.all([
        fetchPlayers(),
        fetchPortfolio(uid),
        fetchHoldings(uid),
        fetchTrades(uid),
      ])
      if (dbPlayers && dbPlayers.length > 0) {
        const mapped = dbPlayers.map(dbPlayerToPlayer)
        setPlayers(mapped)
        setSelectedId((prev) => prev ?? mapped[0]?.id ?? null)
      }
      setCash(portfolio?.cash ?? 10_000)
      setHoldings((dbHoldings ?? []).map(dbHoldingToHolding))
      setTrades((dbTrades ?? []).map(dbTradeToTrade))
    } catch {
      // keep seed data if DB not yet set up
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setUserId(uid)
      const email = data.user?.email ?? ''
      const fallback = data.user?.user_metadata?.full_name ?? email.split('@')[0] ?? 'Trader'
      const capitalized = fallback.charAt(0).toUpperCase() + fallback.slice(1)
      if (uid) {
        fetchProfile(uid)
          .then((profile) => setDisplayName(profile?.display_name ?? capitalized))
          .catch(() => setDisplayName(capitalized))
        reload(uid).finally(() => setLoading(false))
      } else {
        setDisplayName(capitalized)
        setLoading(false)
      }
    }).catch(() => setLoading(false))
  }, [reload])

  // Realtime player price updates
  useEffect(() => {
    const channel = supabase
      .channel('players-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' }, (payload) => {
        setPlayers((prev) => prev.map((p) => (p.id === payload.new.id ? dbPlayerToPlayer(payload.new) : p)))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const player = players.find((p) => p.id === selectedId) ?? players[0]
  const ownedShares = holdings.find((h) => h.playerId === player?.id)?.shares ?? 0

  let holdingsValue = 0
  let pnl24h = 0
  for (const h of holdings) {
    const p = players.find((pl) => pl.id === h.playerId)
    if (!p) continue
    holdingsValue += p.price * h.shares
    pnl24h += (p.price - p.open) * h.shares
  }

  const selectPlayer = (id: string) => {
    setSelectedId(id)
    setSharesInput('1')
    setNotice(null)
    setSide((prev) => prev === 'SELL' ? 'BUY' : prev)
  }

  const quickSell = (id: string) => {
    setSelectedId(id)
    setSide('SELL')
    setSharesInput(String(holdings.find((h) => h.playerId === id)?.shares ?? 0))
    setNotice(null)
    setMode('spot')
  }

  const execute = async () => {
    if (!userId || !player) return
    const shares = Number.parseInt(sharesInput, 10)
    if (!shares || shares <= 0) return
    try {
      await executeTrade(player.id, side, shares, player.price)
      setNotice(`${side === 'BUY' ? 'Bought' : 'Sold'} ${shares} × ${player.tickerName} @ $${player.price.toFixed(2)} — FILLED`)
      await reload(userId)
      setSharesInput('1')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trade failed'
      setNotice(`Error: ${msg}`)
    }
  }

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[1]

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground text-sm">
      Loading market data...
    </div>
  )

  if (!player) return null

  // Use generated chart history (no DB history yet)
  const priceHistory = priceHistoryCache.get(player.id) ?? buildHistory(player, timeframe)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground">
      <HeaderBar mode={mode} onModeChange={setMode} cash={cash} netValue={cash + holdingsValue} displayName={displayName} />
      <main className="min-h-0 flex-1 overflow-hidden">
        {mode === 'home' && (
          <HomeHub
            players={players}
            holdings={holdings}
            trades={trades}
            cash={cash}
            holdingsValue={holdingsValue}
            pnl24h={pnl24h}
            displayName={displayName}
            onModeChange={setMode}
            onQuickSell={quickSell}
          />
        )}

        {mode === 'spot' && (
          <div className="grid h-full min-h-0 grid-cols-[minmax(330px,1fr)_minmax(0,2fr)_minmax(260px,1fr)] gap-4 overflow-hidden p-4">
            <h1 className="sr-only">PlX spot trading desk</h1>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <MarketBoard players={players} selectedId={player.id} onSelect={selectPlayer} />
            </div>
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <PlayerDetail
                player={player}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                priceHistory={priceHistory}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-y-auto">
              <OrderTicket
                player={player}
                side={side}
                onSideChange={(s) => { setSide(s); setNotice(null) }}
                sharesInput={sharesInput}
                onSharesChange={setSharesInput}
                cash={cash}
                ownedShares={ownedShares}
                onExecute={execute}
                notice={notice}
              />
            </div>
          </div>
        )}

        {activeMode.status === 'phase' && <RoadmapView mode={activeMode} onModeChange={setMode} />}
        {mode === 'leaderboard' && (
          <LeaderboardView
            userId={userId}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
          />
        )}
      </main>
    </div>
  )
}
