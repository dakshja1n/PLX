-- ============================================================
-- PlX — execute_trade with order-flow price nudge
--
-- Each BUY pushes the player's price up by 0.1% per share purchased.
-- Each SELL pushes the price down by 0.1% per share sold.
-- A single trade is capped at a ±5% move to prevent manipulation.
-- ============================================================

create or replace function public.execute_trade(
  p_player_id uuid,
  p_side      text,
  p_shares    integer,
  p_price     numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id      uuid    := auth.uid();
  v_fee_rate     numeric := 0.005;
  v_notional     numeric := p_shares * p_price;
  v_fee          numeric := v_notional * v_fee_rate;
  v_cash         numeric;
  v_owned        integer;
  v_avg_cost     numeric;

  -- order-flow nudge: 0.1% per share, capped at ±5% total
  v_nudge_pct    numeric;
  v_nudge_cap    numeric := 0.05;
  v_new_price    numeric;
begin
  -- lock portfolio row
  select cash into v_cash
  from public.portfolios
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Portfolio not found';
  end if;

  if p_side = 'BUY' then
    if v_cash < v_notional + v_fee then
      raise exception 'Insufficient cash';
    end if;

    -- upsert holding with new avg cost
    insert into public.holdings (user_id, player_id, shares, avg_cost)
    values (v_user_id, p_player_id, p_shares, p_price)
    on conflict (user_id, player_id) do update
      set avg_cost = (holdings.avg_cost * holdings.shares + p_price * p_shares)
                     / (holdings.shares + p_shares),
          shares   = holdings.shares + p_shares;

    update public.portfolios
    set cash = cash - v_notional - v_fee
    where user_id = v_user_id;

    -- push price up
    v_nudge_pct := least(p_shares * 0.001, v_nudge_cap);

  elsif p_side = 'SELL' then
    select shares, avg_cost into v_owned, v_avg_cost
    from public.holdings
    where user_id = v_user_id and player_id = p_player_id
    for update;

    if not found or v_owned < p_shares then
      raise exception 'Insufficient shares';
    end if;

    if v_owned = p_shares then
      delete from public.holdings
      where user_id = v_user_id and player_id = p_player_id;
    else
      update public.holdings
      set shares = shares - p_shares
      where user_id = v_user_id and player_id = p_player_id;
    end if;

    update public.portfolios
    set cash = cash + v_notional - v_fee
    where user_id = v_user_id;

    -- push price down
    v_nudge_pct := -least(p_shares * 0.001, v_nudge_cap);

  else
    raise exception 'Invalid side: %', p_side;
  end if;

  -- apply order-flow nudge to player price
  v_new_price := greatest(p_price * (1 + v_nudge_pct), 0.01);
  update public.players
  set price            = round(v_new_price::numeric, 2),
      price_change_24h = round((v_new_price - p_price)::numeric, 2) + price_change_24h,
      updated_at       = now()
  where id = p_player_id;

  -- record trade at the pre-nudge price (what the user actually paid/received)
  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (v_user_id, p_player_id, p_side, p_shares, p_price, v_fee);
end;
$$;

grant execute on function public.execute_trade(uuid, text, integer, numeric) to authenticated;
