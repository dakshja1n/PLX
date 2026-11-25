import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const NUDGE_PER_SHARE = 0.001  // 0.1% per share
const NUDGE_CAP       = 0.05   // max ±5% per batch
const WINDOW_MINUTES  = 10

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all trades in the last 10 minutes
  const { data: recentTrades, error: tradesErr } = await supabase
    .from('trades')
    .select('player_id, side, shares')
    .gte('executed_at', since)
    .in('side', ['BUY', 'SELL', 'SHORT', 'COVER'])

  if (tradesErr) {
    return NextResponse.json({ error: tradesErr.message }, { status: 500 })
  }

  if (!recentTrades || recentTrades.length === 0) {
    return NextResponse.json({ ok: true, nudged: 0, message: 'No trades in window' })
  }

  // Aggregate net volume per player for this window
  const volumeMap = new Map<string, number>()
  for (const t of recentTrades) {
    const isBuy = t.side === 'BUY' || t.side === 'COVER'
    const delta = isBuy ? t.shares : -t.shares
    volumeMap.set(t.player_id, (volumeMap.get(t.player_id) ?? 0) + delta)
  }

  // Fetch 7-day rolling net volume per affected player
  const playerIds = Array.from(volumeMap.keys())
  const { data: weekTrades } = await supabase
    .from('trades')
    .select('player_id, side, shares')
    .gte('executed_at', sevenDaysAgo)
    .in('player_id', playerIds)
    .in('side', ['BUY', 'SELL', 'SHORT', 'COVER'])

  const weekVolumeMap = new Map<string, number>()
  for (const t of weekTrades ?? []) {
    const isBuy = t.side === 'BUY' || t.side === 'COVER'
    const delta = isBuy ? t.shares : -t.shares
    weekVolumeMap.set(t.player_id, (weekVolumeMap.get(t.player_id) ?? 0) + delta)
  }

  // Fetch current prices for affected players
  const { data: players } = await supabase
    .from('players')
    .select('id, price, price_change_24h')
    .in('id', playerIds)

  if (!players) return NextResponse.json({ ok: true, nudged: 0 })

  let nudged = 0
  for (const player of players) {
    const netShares = volumeMap.get(player.id) ?? 0
    if (netShares === 0) continue

    const rawPct = netShares * NUDGE_PER_SHARE
    const nudgePct = Math.max(-NUDGE_CAP, Math.min(NUDGE_CAP, rawPct))
    const newPrice = Math.max(Number(player.price) * (1 + nudgePct), 0.01)
    const roundedPrice = Math.round(newPrice * 100) / 100
    const priceDiff = roundedPrice - Number(player.price)

    const { error: updateErr } = await supabase
      .from('players')
      .update({
        price: roundedPrice,
        price_change_24h: Math.round((Number(player.price_change_24h) + priceDiff) * 100) / 100,
        net_volume_7d: weekVolumeMap.get(player.id) ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', player.id)

    if (!updateErr) nudged++
  }

  return NextResponse.json({ ok: true, nudged, playersWithActivity: playerIds.length })
}
