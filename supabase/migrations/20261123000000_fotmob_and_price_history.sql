-- ============================================================
-- PlX — FotMob ID + price history
-- ============================================================


-- ------------------------------------------------------------
-- 1. Add fotmob_id to players
-- ------------------------------------------------------------
alter table public.players
  add column if not exists fotmob_id integer unique;

create index if not exists players_fotmob_id_idx on public.players (fotmob_id);


-- ------------------------------------------------------------
-- 2. price_history table
-- Stores one row per player per day (inserted by update-prices script).
-- Used for the price chart in player-detail.
-- ------------------------------------------------------------
create table if not exists public.price_history (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  price       numeric not null,
  recorded_at timestamptz not null default now()
);

create index if not exists price_history_player_recorded_idx
  on public.price_history (player_id, recorded_at desc);

alter table public.price_history enable row level security;

create policy "Public read price_history"
  on public.price_history for select
  using (true);

grant select on public.price_history to anon, authenticated;
grant all    on public.price_history to service_role;


-- ------------------------------------------------------------
-- 3. RPC: get_price_history
-- Returns price history for a player, most recent first, up to limit rows.
-- ------------------------------------------------------------
create or replace function public.get_price_history(
  p_player_id uuid,
  p_limit     integer default 365
)
returns table (price numeric, recorded_at timestamptz)
language sql
security definer
stable
as $$
  select price, recorded_at
  from public.price_history
  where player_id = p_player_id
  order by recorded_at desc
  limit p_limit;
$$;

grant execute on function public.get_price_history(uuid, integer) to anon, authenticated;
