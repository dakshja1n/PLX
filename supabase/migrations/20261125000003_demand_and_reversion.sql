-- ============================================================
-- PlX — Demand cron + mean reversion
-- Run in Supabase SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add net_volume_7d to players
-- ------------------------------------------------------------
alter table public.players
  add column if not exists net_volume_7d integer not null default 0;

-- ------------------------------------------------------------
-- 2. Rewrite execute_trade — remove instant order-flow nudge
--    Trades are now recorded only; demand cron applies nudge.
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

  elsif p_side = 'SELL' then
    select shares, avg_cost, borrowed_amount into v_owned, v_avg_cost, v_borrowed
    from public.holdings
    where user_id = v_user_id and player_id = p_player_id
    for update;

    if not found or v_owned < p_shares then
      raise exception 'Insufficient shares';
    end if;

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

      update public.portfolios
      set cash = cash + v_notional - v_repay - v_fee
      where user_id = v_user_id;
    end;

  else
    raise exception 'Invalid side: %', p_side;
  end if;

  insert into public.trades (user_id, player_id, side, shares, price, fee, leverage, borrowed_amount)
  values (v_user_id, p_player_id, p_side, p_shares, p_price, v_fee, p_leverage, v_borrowed);
end;
$$;

grant execute on function public.execute_trade(uuid, text, integer, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- 3. Rewrite open_short — remove instant order-flow nudge
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
begin
  select cash into v_cash
  from public.portfolios
  where user_id = v_user_id
  for update;

  if not found then raise exception 'Portfolio not found'; end if;
  if v_cash < v_collateral + v_fee then raise exception 'Insufficient cash for collateral'; end if;

  update public.portfolios
  set cash = cash - v_collateral - v_fee + v_notional
  where user_id = v_user_id;

  insert into public.short_positions (user_id, player_id, shares, open_price, collateral, liquidation_price)
  values (v_user_id, p_player_id, p_shares, p_price, v_collateral, v_liq_price)
  returning id into v_short_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (v_user_id, p_player_id, 'SHORT', p_shares, p_price, v_fee);

  return v_short_id;
end;
$$;

grant execute on function public.open_short(uuid, integer, numeric) to authenticated;

-- ------------------------------------------------------------
-- 4. Rewrite cover_short — remove instant order-flow nudge
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
begin
  select open_price, shares, collateral, player_id into v_open_price, v_owned, v_collateral, v_player_id
  from public.short_positions
  where id = p_short_id and user_id = v_user_id
  for update;

  if not found then raise exception 'Short position not found'; end if;
  if p_shares > v_owned then raise exception 'Cannot cover more shares than open position'; end if;

  v_pnl        := (v_open_price - p_price) * p_shares;
  v_col_return := v_collateral * p_shares / v_owned;

  if p_shares = v_owned then
    delete from public.short_positions where id = p_short_id;
  else
    update public.short_positions
    set shares     = shares - p_shares,
        collateral = collateral - v_col_return
    where id = p_short_id;
  end if;

  update public.portfolios
  set cash = cash + v_col_return + v_pnl - v_fee - v_notional
  where user_id = v_user_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (v_user_id, v_player_id, 'COVER', p_shares, p_price, v_fee);
end;
$$;

grant execute on function public.cover_short(uuid, integer, numeric) to authenticated;
