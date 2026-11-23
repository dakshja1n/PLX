/**
 * Core price-update logic shared between the CLI script and the Vercel cron route.
 */

import { createClient } from '@supabase/supabase-js'

// Competition weights — K factor applied to performance delta (not yet implemented).
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

/**
 * STUB: Performance delta calculation.
 *
 * Returns 0 until metrics and magnitudes are decided by the owner.
 * Replace the body of this function when ready — the signature and
 * all inputs are already wired up.
 *
 * @param match - FotMob recentMatches entry for one game
 * @param competitionWeight - K factor for this competition
 * @returns price delta as a decimal fraction of current price (e.g. 0.02 = +2%)
 *
 * Available fields on `match`:
 *   match.goals           — goals scored
 *   match.assists         — assists
 *   match.yellowCards     — yellow cards
 *   match.redCards        — red cards
 *   match.minutesPlayed   — minutes on pitch
 *   match.ratingProps.rating — FotMob rating string ("6.5", "8.0", …)
 *   match.playerOfTheMatch — boolean
 *   match.homeScore / match.awayScore — final score
 *   match.isHomeTeam      — was this player's team at home
 *   match.onBench         — was player an unused substitute
 */
export function computePerformanceDelta(
  match: Record<string, unknown>,
  competitionWeight: number,
): number {
  // TODO: implement metric scoring
  void match
  void competitionWeight
  return 0
}

function deriveStatus(data: Record<string, unknown>): 'active' | 'injured' | 'suspended' {
  if (data?.injuryInformation) return 'injured'
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
  return { updated, errors, date: today }
}
