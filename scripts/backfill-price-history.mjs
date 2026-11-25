/**
 * backfill-price-history.mjs
 *
 * Seeds the price_history table with current prices for all players
 * that don't yet have any history entries, so the chart has real data
 * from day 1 instead of generated placeholder data.
 *
 * Run once:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-price-history.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Fetch all players
  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, price')
    .order('name')

  if (error) throw error
  console.log(`Found ${players.length} players`)

  // Find which players already have price history
  const { data: existing } = await supabase
    .from('price_history')
    .select('player_id')

  const hasHistory = new Set((existing ?? []).map(r => r.player_id))
  const toSeed = players.filter(p => !hasHistory.has(p.id))
  console.log(`Seeding ${toSeed.length} players with no history...`)

  // Insert current price as initial history point
  const rows = toSeed.map(p => ({
    player_id: p.id,
    price: p.price,
    recorded_at: new Date().toISOString(),
  }))

  // Batch insert in chunks of 100
  let inserted = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error: insertError } = await supabase
      .from('price_history')
      .insert(chunk)
    if (insertError) {
      console.error(`Error inserting chunk ${i}–${i + chunk.length}: ${insertError.message}`)
    } else {
      inserted += chunk.length
      process.stdout.write(`\r  ${inserted}/${toSeed.length}`)
    }
  }

  console.log(`\n\nDone. Seeded ${inserted} price history entries.`)
}

main().catch(err => { console.error(err); process.exit(1) })
