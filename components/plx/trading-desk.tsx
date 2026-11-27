'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { coverShort, executeTrade, fetchHoldings, fetchNetWorthHistory, fetchPlayers, fetchPortfolio, fetchProfile, fetchPriceHistory, fetchShortPositions, fetchTrades, openShort, timeframeLimit } from '@/lib/supabase/queries'
import {
  INITIAL_PLAYERS,
  type ChartPoint,
  type Holding,
  type Player,
  type ShortPosition,
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
    leverage: Number(h.leverage ?? 1),
    borrowedAmount: Number(h.borrowed_amount ?? 0),
    liquidationPrice: Number(h.liquidation_price ?? 0),
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
    leverage: Number(t.leverage ?? 1),
    status: 'FILLED',
  }
}

function dbShortToShort(s: Record<string, unknown>): ShortPosition {
  return {
    id: s.id as string,
    playerId: s.player_id as string,
    shares: Number(s.shares),
    openPrice: Number(s.open_price),
    collateral: Number(s.collateral),
    liquidationPrice: Number(s.liquidation_price),
    openedAt: formatTimestamp(new Date(s.opened_at as string)),
  }
}

export function TradingDesk() {
  const [mode, setMode] = useState<ModeId>('spot')
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS)
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL_PLAYERS[0]?.id ?? null)
  const [cash, setCash] = useState(10_000)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [shortPositions, setShortPositions] = useState<ShortPosition[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [netWorthHistory, setNetWorthHistory] = useState<ChartPoint[]>([])
  const [side, setSide] = useState<TradeSide>('BUY')
  const [sharesInput, setSharesInput] = useState('1')
  const [leverage, setLeverage] = useState(1)
  const [timeframe, setTimeframe] = useState<Timeframe>('7D')
  const [notice, setNotice] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('Trader')
  const [loading, setLoading] = useState(true)
  const [priceHistoryCache, setPriceHistoryCache] = useState<Map<string, ChartPoint[]>>(new Map())
  const fetchingHistory = useRef<Set<string>>(new Set())

  const loadPriceHistory = useCallback(async (playerId: string, tf: string) => {
    const cacheKey = `${playerId}:${tf}`
    if (fetchingHistory.current.has(cacheKey)) return
    fetchingHistory.current.add(cacheKey)
    try {
      const rows = await fetchPriceHistory(playerId, timeframeLimit(tf))
      if (rows.length >= 2) {
        const points: ChartPoint[] = rows.map(r => ({
          label: r.recorded_at.slice(8, 10) + '.' + r.recorded_at.slice(5, 7),
          price: Number(r.price),
        }))
        setPriceHistoryCache(prev => new Map(prev).set(cacheKey, points))
      }
    } catch {
      // fall back to generated data
    }
  }, [])

  const reload = useCallback(async (uid: string) => {
    try {
      const [dbPlayers, portfolio, dbHoldings, dbTrades, dbShorts, nwRows] = await Promise.all([
        fetchPlayers(),
        fetchPortfolio(uid),
        fetchHoldings(uid),
        fetchTrades(uid),
        fetchShortPositions(uid),
        fetchNetWorthHistory(uid, 30),
      ])
      if (dbPlayers && dbPlayers.length > 0) {
        const mapped = dbPlayers.map(dbPlayerToPlayer)
        setPlayers(mapped)
        setSelectedId((prev) => prev ?? mapped[0]?.id ?? null)
      }
      setCash(portfolio?.cash ?? 10_000)
      setHoldings((dbHoldings ?? []).map(dbHoldingToHolding))
      setTrades((dbTrades ?? []).map(dbTradeToTrade))
      setShortPositions((dbShorts ?? []).map(dbShortToShort))
      setNetWorthHistory(nwRows.map(r => ({ label: r.recorded_at.slice(8, 10) + '.' + r.recorded_at.slice(5, 7), price: r.net_worth })))
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

  // Load real price history when player or timeframe changes
  useEffect(() => {
    if (selectedId) loadPriceHistory(selectedId, timeframe)
  }, [selectedId, timeframe, loadPriceHistory])

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
    setLeverage(1)
    setSide((prev) => prev === 'SELL' ? 'BUY' : prev)
  }

  const quickSell = (id: string) => {
    setSelectedId(id)
    setSide('SELL')
    setLeverage(1)
    setSharesInput(String(holdings.find((h) => h.playerId === id)?.shares ?? 0))
    setNotice(null)
    setMode('spot')
  }

  const quickCover = (id: string) => {
    setSelectedId(id)
    setSide('COVER')
    setLeverage(1)
    setSharesInput(String(shortPositions.find(s => s.playerId === id)?.shares ?? 0))
    setNotice(null)
    setMode('spot')
  }

  const execute = async () => {
    if (!userId || !player) return
    const shares = Number.parseInt(sharesInput, 10)
    if (!shares || shares <= 0) return
    try {
      if (side === 'SHORT') {
        await openShort(player.id, shares, player.price)
        setNotice(`Opened short: ${shares} × ${player.tickerName} @ ${player.price.toFixed(2)} — FILLED`)
      } else if (side === 'COVER') {
        const sp = shortPositions.find(s => s.playerId === player.id)
        if (!sp) { setNotice('No open short for this player'); return }
        await coverShort(sp.id, shares, player.price)
        setNotice(`Covered ${shares} × ${player.tickerName} @ ${player.price.toFixed(2)} — FILLED`)
      } else {
        await executeTrade(player.id, side, shares, player.price, side === 'BUY' ? leverage : 1)
        setNotice(`${side === 'BUY' ? 'Bought' : 'Sold'} ${shares} × ${player.tickerName} @ $${player.price.toFixed(2)}${side === 'BUY' && leverage > 1 ? ` (${leverage}×)` : ''} — FILLED`)
      }
      await reload(userId)
      setSharesInput('1')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trade failed'
      setNotice(`Error: ${msg}`)
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground text-sm">
      Loading market data...
    </div>
  )

  if (!player) return null

  // Use generated chart history (no DB history yet)
  const priceHistory = priceHistoryCache.get(`${player.id}:${timeframe}`) ?? buildHistory(player, timeframe)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground">
      <HeaderBar mode={mode} onModeChange={setMode} cash={cash} netValue={cash + holdingsValue} displayName={displayName} />
      <main className="min-h-0 flex-1 overflow-hidden">
        {mode === 'home' && (
          <HomeHub
            players={players}
            holdings={holdings}
            trades={trades}
            shortPositions={shortPositions}
            cash={cash}
            holdingsValue={holdingsValue}
            pnl24h={pnl24h}
            displayName={displayName}
            netWorthHistory={netWorthHistory}
            onModeChange={setMode}
            onQuickSell={quickSell}
            onQuickCover={quickCover}
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
                onSideChange={(s) => { setSide(s); setNotice(null); setLeverage(1) }}
                sharesInput={sharesInput}
                onSharesChange={setSharesInput}
                leverage={leverage}
                onLeverageChange={setLeverage}
                cash={cash}
                ownedShares={ownedShares}
                shortPositions={shortPositions.filter(s => s.playerId === player.id)}
                onExecute={execute}
                notice={notice}
              />
            </div>
          </div>
        )}

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
