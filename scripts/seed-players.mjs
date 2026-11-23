/**
 * seed-players.mjs
 *
 * One-time script. Fetches FotMob playerData for every current PL squad member,
 * derives initial price from the latest SciSports market value (EUR → USD 1:1 / 1 000 000),
 * and upserts rows into the Supabase players table.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-players.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// 2026/27 Premier League clubs — verified from FotMob live match data.
const PL_TEAMS = [
  { id: 8650,  slug: 'liverpool' },
  { id: 9825,  slug: 'arsenal' },
  { id: 8456,  slug: 'manchester-city' },
  { id: 10260, slug: 'manchester-united' },
  { id: 8455,  slug: 'chelsea' },
  { id: 8586,  slug: 'tottenham-hotspur' },
  { id: 10261, slug: 'newcastle-united' },
  { id: 10252, slug: 'aston-villa' },
  { id: 10204, slug: 'brighton-hove-albion' },
  { id: 8668,  slug: 'everton' },
  { id: 10203, slug: 'nottingham-forest' },
  { id: 9879,  slug: 'fulham' },
  { id: 9937,  slug: 'brentford' },
  { id: 9826,  slug: 'crystal-palace' },
  { id: 8678,  slug: 'afc-bournemouth' },
  { id: 9902,  slug: 'ipswich-town' },
  { id: 8463,  slug: 'leeds-united' },
  { id: 8667,  slug: 'hull-city' },
  { id: 8472,  slug: 'sunderland' },
  { id: 8669,  slug: 'coventry-city' },
]

// Fetches the current FotMob Next.js build ID (changes on each deployment).
async function getBuildId() {
  const res = await fetch('https://www.fotmob.com/')
  const html = await res.text()
  const m = html.match(/"buildId":"([^"]+)"/)
  if (!m) throw new Error('Could not find FotMob buildId')
  return m[1]
}

// Returns all outfield players + keepers from a FotMob squad page.
async function fetchSquad(buildId, teamId, slug) {
  const url = `https://www.fotmob.com/_next/data/${buildId}/en/teams/${teamId}/squad/${slug}.json`
  const res = await fetch(url)
  const data = await res.json()
  const fallback = data?.pageProps?.fallback ?? {}
  const key = Object.keys(fallback)[0]
  if (!key) return []
  const teamData = fallback[key]
  const teamName = teamData?.details?.name ?? slug
  const groups = teamData?.squad?.squad ?? []
  const players = []
  for (const group of groups) {
    if (group.title === 'coach') continue
    for (const m of group.members ?? []) {
      if (m.id) {
        players.push({
          fotmob_id: m.id,
          name: m.name,
          club: teamName,
          position: group.title,  // keepers | defenders | midfielders | attackers
          nationality: m.cname ?? '',
          ccode: m.ccode ?? '',
        })
      }
    }
  }
  return players
}

// Fetches live playerData from FotMob for a single player.
async function fetchPlayerData(fotmobId) {
  const url = `https://www.fotmob.com/api/data/playerData?id=${fotmobId}`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

// Maps FotMob position group title to a short label.
function mapPosition(group) {
  return { keepers: 'GK', defenders: 'DEF', midfielders: 'MID', attackers: 'FWD' }[group] ?? group
}

// Derives player status from FotMob response.
function deriveStatus(data) {
  if (data?.injuryInformation) return 'injured'
  const s = data?.status
  if (typeof s === 'string') {
    if (s === 'injured') return 'injured'
    if (s === 'suspended') return 'suspended'
  }
  return 'active'
}

async function main() {
  console.log('Fetching FotMob build ID...')
  const buildId = await getBuildId()
  console.log(`Build ID: ${buildId}`)

  // Step 1: collect all squad members across 20 clubs
  console.log('\nFetching squads...')
  const allPlayers = []
  for (const team of PL_TEAMS) {
    const squad = await fetchSquad(buildId, team.id, team.slug)
    console.log(`  ${team.slug}: ${squad.length} players`)
    allPlayers.push(...squad)
    await sleep(300)
  }
  console.log(`\nTotal squad members: ${allPlayers.length}`)

  // Deduplicate by fotmob_id (player on loan may appear in two squads)
  const seen = new Set()
  const unique = allPlayers.filter(p => {
    if (seen.has(p.fotmob_id)) return false
    seen.add(p.fotmob_id)
    return true
  })
  console.log(`After dedup: ${unique.length} players`)

  // Step 2: for each player, fetch playerData to get market value + status
  console.log('\nFetching player data from FotMob...')
  let upserted = 0
  let skipped = 0

  for (let i = 0; i < unique.length; i++) {
    const p = unique[i]
    process.stdout.write(`\r  ${i + 1}/${unique.length} — ${p.name.padEnd(30)}`)

    let price = 1.0
    let marketValue = 0
    let status = 'active'
    let tickerName = makeTicker(p.name)

    try {
      const data = await fetchPlayerData(p.fotmob_id)
      if (data) {
        const mvs = data?.marketValues?.values ?? []
        if (mvs.length > 0) {
          const latest = mvs[mvs.length - 1]
          const eur = latest.value ?? 0
          price = Math.max(eur / 1_000_000, 0.5)  // minimum $0.50
          marketValue = eur
        }
        status = deriveStatus(data)
      }
    } catch {
      // keep defaults
    }

    const row = {
      fotmob_id: p.fotmob_id,
      name: p.name,
      ticker_name: tickerName,
      club: p.club,
      nationality: p.nationality,
      position: mapPosition(p.position),
      price: Math.round(price * 100) / 100,
      price_change_24h: 0,
      market_value: marketValue,
      status,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('players')
      .upsert(row, { onConflict: 'fotmob_id' })

    if (error) {
      console.error(`\n  Error upserting ${p.name}: ${error.message}`)
      skipped++
    } else {
      upserted++
    }

    await sleep(150)
  }

  console.log(`\n\nDone. Upserted: ${upserted}, Skipped: ${skipped}`)
}

// Generates a 4-letter ticker from a player's name.
function makeTicker(name) {
  const parts = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 4)
  const last = parts[parts.length - 1]
  return last.slice(0, 4)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

main().catch(err => { console.error(err); process.exit(1) })
