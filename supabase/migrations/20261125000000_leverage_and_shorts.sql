-- ============================================================
-- PlX — Leverage on longs + Short positions
-- Run in Supabase SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add leverage columns to holdings
-- ------------------------------------------------------------
alter table public.holdings
  add column if not exists leverage          numeric not null default 1,
  add column if not exists borrowed_amount   numeric not null default 0,
  add column if not exists liquidation_price numeric not null default 0;

-- ------------------------------------------------------------
-- 2. Add leverage + side columns to trades
-- ------------------------------------------------------------
alter table public.trades
  add column if not exists leverage        numeric not null default 1,
  add column if not exists borrowed_amount numeric not null default 0;

alter table public.trades
  drop constraint if exists trades_side_check;
alter table public.trades
  add constraint trades_side_check check (side in ('BUY', 'SELL', 'SHORT', 'COVER'));

-- ------------------------------------------------------------
-- 3. short_positions table
-- ------------------------------------------------------------
create table if not exists public.short_positions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  player_id         uuid not null references public.players(id) on delete cascade,
  shares            integer not null check (shares > 0),
  open_price        numeric not null,
  collateral        numeric not null,
  liquidation_price numeric not null,
  opened_at         timestamptz not null default now()
);

alter table public.short_positions enable row level security;

create policy "Users manage own short positions"
  on public.short_positions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.short_positions to authenticated;

-- ------------------------------------------------------------
-- 4. execute_trade — add leverage support
-- liquidation_price = avg_cost × (1 − 1/leverage) × 0.95
-- ------------------------------------------------------------
create or replace function public.execute_trade(
  p_player_id uuid,
  p_side      text,
  p_shares    integer,
  p_price     numeric,
  p_leverage  numeric default 1
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id        uuid    := auth.uid();
  v_fee_rate       numeric := 0.005;
  v_notional       numeric := p_shares * p_price;
  v_equity         numeric := v_notional / p_leverage;
  v_borrowed       numeric := v_notional - v_equity;
  v_fee            numeric := v_notional * v_fee_rate;
  v_cash           numeric;
  v_owned          integer;
  v_avg_cost       numeric;
  v_new_avg        numeric;
  v_new_shares     integer;
  v_liq_price      numeric;
  v_nudge_pct      numeric;
  v_nudge_cap      numeric := 0.05;
  v_new_price      numeric;
begin
  select cash into v_cash
  from public.portfolios
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Portfolio not found';
  end if;

  if p_side = 'BUY' then
    if v_cash < v_equity + v_fee then
      raise exception 'Insufficient cash';
    end if;

    -- compute new avg cost and liquidation price
    select shares, avg_cost into v_owned, v_avg_cost
    from public.holdings
    where user_id = v_user_id and player_id = p_player_id;

    if found then
      v_new_shares := v_owned + p_shares;
      v_new_avg    := (v_avg_cost * v_owned + p_price * p_shares) / v_new_shares;
    else
      v_new_shares := p_shares;
      v_new_avg    := p_price;
    end if;

    if p_leverage > 1 then
      v_liq_price := v_new_avg * (1 - 1.0 / p_leverage) * 0.95;
    else
      v_liq_price := 0;
    end if;

    insert into public.holdings (user_id, player_id, shares, avg_cost, leverage, borrowed_amount, liquidation_price)
    values (v_user_id, p_player_id, p_shares, p_price, p_leverage, v_borrowed, v_liq_price)
    on conflict (user_id, player_id) do update
      set shares            = holdings.shares + p_shares,
          avg_cost          = v_new_avg,
          leverage          = p_leverage,
          borrowed_amount   = holdings.borrowed_amount + v_borrowed,
          liquidation_price = v_liq_price;

    update public.portfolios
    set cash = cash - v_equity - v_fee
    where user_id = v_user_id;

    v_nudge_pct := least(p_shares * 0.001, v_nudge_cap);

  elsif p_side = 'SELL' then
    select shares, avg_cost, borrowed_amount into v_owned, v_avg_cost, v_borrowed
    from public.holdings
    where user_id = v_user_id and player_id = p_player_id
    for update;

    if not found or v_owned < p_shares then
      raise exception 'Insufficient shares';
    end if;

    -- pay back proportional borrowed amount
    declare
      v_repay numeric := v_borrowed * p_shares / v_owned;
    begin
      if v_owned = p_shares then
        delete from public.holdings
        where user_id = v_user_id and player_id = p_player_id;
      else
        update public.holdings
        set shares          = shares - p_shares,
            borrowed_amount = borrowed_amount - v_repay
        where user_id = v_user_id and player_id = p_player_id;
      end if;

      -- proceeds: notional minus repay minus fee
      update public.portfolios
      set cash = cash + v_notional - v_repay - v_fee
      where user_id = v_user_id;
    end;

    v_nudge_pct := -least(p_shares * 0.001, v_nudge_cap);

  else
    raise exception 'Invalid side: %', p_side;
  end if;

  -- order-flow nudge
  v_new_price := greatest(p_price * (1 + v_nudge_pct), 0.01);
  update public.players
  set price            = round(v_new_price::numeric, 2),
      price_change_24h = price_change_24h + round((v_new_price - p_price)::numeric, 2),
      updated_at       = now()
  where id = p_player_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee, leverage, borrowed_amount)
  values (v_user_id, p_player_id, p_side, p_shares, p_price, v_fee, p_leverage, v_borrowed);
end;
$$;

grant execute on function public.execute_trade(uuid, text, integer, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- 5. open_short
-- User receives: shares × price − fee as cash
-- Collateral = notional (held as security)
-- Liquidation at open_price × 1.5
-- ------------------------------------------------------------
create or replace function public.open_short(
  p_player_id uuid,
  p_shares    integer,
  p_price     numeric
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_user_id    uuid    := auth.uid();
  v_fee_rate   numeric := 0.005;
  v_notional   numeric := p_shares * p_price;
  v_fee        numeric := v_notional * v_fee_rate;
  v_collateral numeric := v_notional;
  v_liq_price  numeric := p_price * 1.5;
  v_cash       numeric;
  v_short_id   uuid;
  v_nudge_pct  numeric := -least(p_shares * 0.001, 0.05);
  v_new_price  numeric;
begin
  select cash into v_cash
  from public.portfolios
  where user_id = v_user_id
  for update;

  if not found then raise exception 'Portfolio not found'; end if;
  if v_cash < v_collateral + v_fee then raise exception 'Insufficient cash for collateral'; end if;

  -- lock collateral + fee, receive notional back (net: user pays fee only)
  update public.portfolios
  set cash = cash - v_collateral - v_fee + v_notional
  where user_id = v_user_id;

  insert into public.short_positions (user_id, player_id, shares, open_price, collateral, liquidation_price)
  values (v_user_id, p_player_id, p_shares, p_price, v_collateral, v_liq_price)
  returning id into v_short_id;

  -- order-flow nudge down (shorting = selling pressure)
  v_new_price := greatest(p_price * (1 + v_nudge_pct), 0.01);
  update public.players
  set price            = round(v_new_price::numeric, 2),
      price_change_24h = price_change_24h + round((v_new_price - p_price)::numeric, 2),
      updated_at       = now()
  where id = p_player_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (v_user_id, p_player_id, 'SHORT', p_shares, p_price, v_fee);

  return v_short_id;
end;
$$;

grant execute on function public.open_short(uuid, integer, numeric) to authenticated;

-- ------------------------------------------------------------
-- 6. cover_short
-- User pays: shares × current_price + fee
-- Profit = (open_price − current_price) × shares − fee
-- ------------------------------------------------------------
create or replace function public.cover_short(
  p_short_id uuid,
  p_shares   integer,
  p_price    numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id    uuid := auth.uid();
  v_fee_rate   numeric := 0.005;
  v_notional   numeric := p_shares * p_price;
  v_fee        numeric := v_notional * v_fee_rate;
  v_open_price numeric;
  v_owned      integer;
  v_collateral numeric;
  v_player_id  uuid;
  v_pnl        numeric;
  v_col_return numeric;
  v_nudge_pct  numeric := least(p_shares * 0.001, 0.05);
  v_new_price  numeric;
begin
  select open_price, shares, collateral, player_id into v_open_price, v_owned, v_collateral, v_player_id
  from public.short_positions
  where id = p_short_id and user_id = v_user_id
  for update;

  if not found then raise exception 'Short position not found'; end if;
  if p_shares > v_owned then raise exception 'Cannot cover more shares than open position'; end if;

  v_pnl       := (v_open_price - p_price) * p_shares;
  v_col_return := v_collateral * p_shares / v_owned;

  if p_shares = v_owned then
    delete from public.short_positions where id = p_short_id;
  else
    update public.short_positions
    set shares     = shares - p_shares,
        collateral = collateral - v_col_return
    where id = p_short_id;
  end if;

  -- return collateral + P&L − fee
  update public.portfolios
  set cash = cash + v_col_return + v_pnl - v_fee - v_notional
  where user_id = v_user_id;

  -- order-flow nudge up (covering = buying pressure)
  v_new_price := greatest(p_price * (1 + v_nudge_pct), 0.01);
  update public.players
  set price            = round(v_new_price::numeric, 2),
      price_change_24h = price_change_24h + round((v_new_price - p_price)::numeric, 2),
      updated_at       = now()
  where id = v_player_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (v_user_id, v_player_id, 'COVER', p_shares, p_price, v_fee);
end;
$$;

grant execute on function public.cover_short(uuid, integer, numeric) to authenticated;

-- ------------------------------------------------------------
-- 7. get_leaderboard — include short position exposure
-- ------------------------------------------------------------
create or replace function public.get_leaderboard()
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  net_worth    numeric
)
language sql
security definer
stable
as $$
  select
    row_number() over (order by net_worth desc) as rank,
    user_id,
    display_name,
    net_worth
  from (
    select
      p.user_id,
      coalesce(pr.display_name, null) as display_name,
      p.cash
        + coalesce(sum(h.shares * pl.price), 0)
        - coalesce(sum(h.borrowed_amount), 0)
        + coalesce((
            select sum((sp.open_price - pl2.price) * sp.shares)
            from public.short_positions sp
            join public.players pl2 on pl2.id = sp.player_id
            where sp.user_id = p.user_id
          ), 0) as net_worth
    from portfolios p
    left join holdings h on h.user_id = p.user_id
    left join players pl on pl.id = h.player_id
    left join profiles pr on pr.user_id = p.user_id
    group by p.user_id, p.cash, pr.display_name
  ) sub
  order by net_worth desc
  limit 100;
$$;

grant execute on function public.get_leaderboard() to authenticated;
