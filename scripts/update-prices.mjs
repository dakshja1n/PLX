/**
 * update-prices.mjs
 *
 * CLI wrapper for the shared update logic in lib/update-prices.ts.
 * The actual logic lives in lib/ so it can be shared with the Vercel cron route.
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node --import tsx/esm scripts/update-prices.mjs
 *   # Optionally override date:
 *   UPDATE_DATE=2026-11-22 node --import tsx/esm scripts/update-prices.mjs
 */

import { runUpdate } from '../lib/update-prices.js'

runUpdate({ targetDate: process.env.UPDATE_DATE })
  .catch(err => { console.error(err); process.exit(1) })
