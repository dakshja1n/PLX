/**
 * Core price-update logic shared between the CLI script and the Vercel cron route.
 */

import { createClient } from '@supabase/supabase-js'

export const COMPETITION_WEIGHTS: Record<number, number> = {
  47:   1.2,  // Premier League
  42:   1.5,  // UEFA Champions League
  73:   0.8,  // FA Cup
  108:  0.8,  // EFL Cup (Carabao Cup)
  9806: 0.6,  // UEFA Nations League
  132:  0.6,  // World Cup Qualification
  77:   0.5,  // International Friendly
}
const DEFAULT_WEIGHT = 0.5

// lineupPositionId ranges: 1xx = GK, 2xx = DEF, 3xx = MID, 4xx = FWD
function positionBucket(lineupPositionId: unknown): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const id = Number(lineupPositionId ?? 0)
  if (id >= 100 && id < 200) return 'GK'
  if (id >= 200 && id < 300) return 'DEF'
  if (id >= 300 && id < 400) return 'MID'
  if (id >= 400 && id < 500) return 'FWD'
  return 'MID'
}

function ratingMultiplier(ratingStr: unknown): number {
  const r = parseFloat(String(ratingStr ?? '6.5'))
  if (r >= 8.0) return 1.3
  if (r >= 7.0) return 1.1
  if (r >= 6.0) return 1.0
  if (r >= 5.0) return 0.85
  return 0.7
}

// @returns price delta as a decimal fraction (e.g. 0.025 = +2.5%)
export function computePerformanceDelta(
  match: Record<string, unknown>,
  competitionWeight: number,
): number {
  const pos = positionBucket(match.lineupPositionId)
  const goals   = Number(match.goals ?? 0)
  const assists = Number(match.assists ?? 0)
  const yellows = Number(match.yellowCards ?? 0)
  const reds    = Number(match.redCards ?? 0)
  const minutes = Number(match.minutesPlayed ?? 0)
  const potm    = Boolean(match.playerOfTheMatch)

  const homeScore = Number(match.homeScore ?? 0)
  const awayScore = Number(match.awayScore ?? 0)
  const isHome    = Boolean(match.isHomeTeam)
  const teamScore = isHome ? homeScore : awayScore
  const oppScore  = isHome ? awayScore : homeScore
  const won  = teamScore > oppScore
  const drew = teamScore === oppScore
  const cleanSheet = oppScore === 0

  const rating = (match.ratingProps as Record<string, unknown> | undefined)?.rating

  // --- base points by event ---
  const goalPts: Record<string, number>   = { GK: 8, DEF: 6, MID: 4, FWD: 5 }
  const assistPts: Record<string, number> = { GK: 3, DEF: 3, MID: 3, FWD: 3 }
  const csPts: Record<string, number>     = { GK: 4, DEF: 3, MID: 1, FWD: 0 }
  const winPts: Record<string, number>    = { GK: 2, DEF: 2, MID: 1, FWD: 1 }
  const lossPts: Record<string, number>   = { GK: -2, DEF: -2, MID: -1, FWD: -1 }

  let points = 0

  points += goals   * goalPts[pos]
  points += assists * assistPts[pos]
  points -= yellows * 1.5
  points -= reds    * 5

  if (cleanSheet) points += csPts[pos]
  if (won)        points += winPts[pos]
  if (!won && !drew) points += lossPts[pos]

  // full 90 bonus / early sub penalty
  if (minutes >= 88) points += 0.5
  else if (minutes < 60 && minutes > 0) points -= 0.5

  // apply rating multiplier
  points *= ratingMultiplier(rating)

  // flat POTM bonus after multiplier
  if (potm) points += 3

  // convert to price delta fraction: points / 10 × competition weight
  return (points / 10) * competitionWeight
}

function deriveStatus(data: Record<string, unknown>): 'active' | 'injured' | 'suspended' {
  const injury = data?.injuryInformation as Record<string, unknown> | undefined
  if (injury?.isInjured === true) return 'injured'
  const s = data?.status
  if (s === 'injured') return 'injured'
  if (s === 'suspended') return 'suspended'
  return 'active'
}

function utcDateStr(isoString: string): string {
  return isoString.slice(0, 10)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export type UpdateResult = {
  updated: number
  errors: number
  date: string
}

export async function runUpdate(options: {
  supabaseUrl?: string
  serviceRoleKey?: string
  targetDate?: string
  verbose?: boolean
}): Promise<UpdateResult> {
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL
  const serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase credentials')

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const today = options.targetDate ?? new Date().toISOString().slice(0, 10)
  const log = options.verbose !== false

  if (log) console.log(`Running price update for ${today}`)

  const { data: players, error } = await supabase
    .from('players')
    .select('id, fotmob_id, name, price, status')
    .not('fotmob_id', 'is', null)

  if (error) throw error
  if (log) console.log(`Processing ${players.length} players...`)

  let updated = 0
  let errors = 0

  for (let i = 0; i < players.length; i++) {
    const player = players[i]
    if (log) process.stdout.write(`\r  ${i + 1}/${players.length} — ${player.name.padEnd(30)}`)

    try {
      const res = await fetch(`https://www.fotmob.com/api/data/playerData?id=${player.fotmob_id}`)
      if (!res.ok) { errors++; continue }
      const data = await res.json() as Record<string, unknown>

      const previousPrice = Number(player.price)
      let priceDelta = 0

      const recentMatches = (data.recentMatches as Record<string, unknown>[] | undefined) ?? []
      const todayMatches = recentMatches.filter(m => {
        const matchDate = utcDateStr((m.matchDate as { utcTime: string })?.utcTime ?? '')
        return matchDate === today && m.playedInMatch && !m.onBench
      })

      for (const match of todayMatches) {
        const leagueId = match.leagueId as number
        const weight = COMPETITION_WEIGHTS[leagueId] ?? DEFAULT_WEIGHT
        priceDelta += computePerformanceDelta(match, weight)
      }

      const newPrice = Math.max(previousPrice * (1 + priceDelta), 0.01)
      const roundedPrice = Math.round(newPrice * 100) / 100
      const priceChange24h = Math.round((roundedPrice - previousPrice) * 100) / 100
      const newStatus = deriveStatus(data)

      const { error: updateError } = await supabase
        .from('players')
        .update({
          price: roundedPrice,
          price_change_24h: priceChange24h,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', player.id)

      if (updateError) { errors++; continue }

      await supabase
        .from('price_history')
        .insert({ player_id: player.id, price: roundedPrice })

      updated++
    } catch {
      errors++
    }

    await sleep(120)
  }

  if (log) console.log(`\n\nDone. Updated: ${updated}, Errors: ${errors}`)

  // Demand nudge: apply accumulated buy/sell pressure from the day's trades
  const NUDGE_PER_SHARE = 0.001
  const NUDGE_CAP = 0.05
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)

  const { data: dayTrades } = await supabase
    .from('trades')
    .select('player_id, side, shares')
    .gte('executed_at', dayStart.toISOString())
    .in('side', ['BUY', 'SELL', 'SHORT', 'COVER'])

  const volumeMap = new Map<string, number>()
  for (const t of dayTrades ?? []) {
    const isBuy = t.side === 'BUY' || t.side === 'COVER'
    const delta = isBuy ? t.shares : -t.shares
    volumeMap.set(t.player_id, (volumeMap.get(t.player_id) ?? 0) + delta)
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const affectedIds = Array.from(volumeMap.keys())

  if (affectedIds.length > 0) {
    const { data: weekTrades } = await supabase
      .from('trades')
      .select('player_id, side, shares')
      .gte('executed_at', sevenDaysAgo)
      .in('player_id', affectedIds)
      .in('side', ['BUY', 'SELL', 'SHORT', 'COVER'])

    const weekVolumeMap = new Map<string, number>()
    for (const t of weekTrades ?? []) {
      const isBuy = t.side === 'BUY' || t.side === 'COVER'
      const delta = isBuy ? t.shares : -t.shares
      weekVolumeMap.set(t.player_id, (weekVolumeMap.get(t.player_id) ?? 0) + delta)
    }

    const { data: affectedPlayers } = await supabase
      .from('players')
      .select('id, price, price_change_24h')
      .in('id', affectedIds)

    for (const p of affectedPlayers ?? []) {
      const netShares = volumeMap.get(p.id) ?? 0
      if (netShares === 0) continue
      const rawPct = netShares * NUDGE_PER_SHARE
      const nudgePct = Math.max(-NUDGE_CAP, Math.min(NUDGE_CAP, rawPct))
      const newPrice = Math.max(Number(p.price) * (1 + nudgePct), 0.01)
      const roundedPrice = Math.round(newPrice * 100) / 100
      const priceDiff = roundedPrice - Number(p.price)
      await supabase
        .from('players')
        .update({
          price: roundedPrice,
          price_change_24h: Math.round((Number(p.price_change_24h) + priceDiff) * 100) / 100,
          net_volume_7d: weekVolumeMap.get(p.id) ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id)
    }
    if (log) console.log(`Demand nudge applied: ${affectedIds.length} players`)
  }

  // Mean reversion: only on abandoned pumps
  // Conditions: price > market_value * 1.15 AND net_volume_7d < 0
  const REVERSION_K = 0.03
  const REVERSION_THRESHOLD = 1.15

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, price, market_value, net_volume_7d')

  let reverted = 0
  for (const p of allPlayers ?? []) {
    const price = Number(p.price)
    const anchor = Number(p.market_value ?? 0)
    const netVol = Number(p.net_volume_7d ?? 0)
    if (anchor <= 0) continue
    if (price > anchor * REVERSION_THRESHOLD && netVol < 0) {
      const reversionDelta = -REVERSION_K * (price - anchor) / anchor
      const newPrice = Math.max(price * (1 + reversionDelta), 0.01)
      const roundedPrice = Math.round(newPrice * 100) / 100
      await supabase
        .from('players')
        .update({ price: roundedPrice, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      reverted++
    }
  }

  if (log && reverted > 0) console.log(`Mean reversion applied: ${reverted} players`)

  // Liquidate underwater leveraged longs
  const { data: toLiquidate } = await supabase
    .from('holdings')
    .select('user_id, player_id, liquidation_price, players(price)')
    .gt('liquidation_price', 0)

  let liquidations = 0
  for (const h of toLiquidate ?? []) {
    const players = h.players as unknown as { price: number } | null
    const currentPrice = Number(players?.price ?? 0)
    if (currentPrice <= Number(h.liquidation_price)) {
      await supabase.rpc('liquidate_position', { p_user_id: h.user_id, p_player_id: h.player_id })
      liquidations++
    }
  }

  // Liquidate underwater shorts (price rose above liquidation_price)
  const { data: toShortLiq } = await supabase
    .from('short_positions')
    .select('id, user_id, liquidation_price, players(price)')

  for (const s of toShortLiq ?? []) {
    const players2 = s.players as unknown as { price: number } | null
    const currentPrice = Number(players2?.price ?? 0)
    if (currentPrice >= Number(s.liquidation_price)) {
      await supabase.rpc('liquidate_short', { p_user_id: s.user_id, p_short_id: s.id })
      liquidations++
    }
  }

  if (log && liquidations > 0) console.log(`Liquidated: ${liquidations} positions`)

  // Snapshot each user's net worth into net_worth_history
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('user_id, cash')

  for (const portfolio of portfolios ?? []) {
    const { data: userHoldings } = await supabase
      .from('holdings')
      .select('shares, borrowed_amount, players(price)')
      .eq('user_id', portfolio.user_id)

    const { data: userShorts } = await supabase
      .from('short_positions')
      .select('shares, open_price, players(price)')
      .eq('user_id', portfolio.user_id)

    let holdingsValue = 0
    let borrowed = 0
    for (const h of userHoldings ?? []) {
      const price = Number((h.players as unknown as { price: number })?.price ?? 0)
      holdingsValue += h.shares * price
      borrowed += Number(h.borrowed_amount ?? 0)
    }

    let shortPnl = 0
    for (const s of userShorts ?? []) {
      const price = Number((s.players as unknown as { price: number })?.price ?? 0)
      shortPnl += (s.open_price - price) * s.shares
    }

    const netWorth = Number(portfolio.cash) + holdingsValue - borrowed + shortPnl

    await supabase.from('net_worth_history').insert({
      user_id: portfolio.user_id,
      net_worth: Math.round(netWorth * 100) / 100,
    })
  }

  if (log) console.log(`Net worth snapshots: ${(portfolios ?? []).length} users`)

  return { updated, errors, date: today }
}
