-- ============================================================
-- PlX — Liquidation RPCs (service_role only)
-- ============================================================

-- ------------------------------------------------------------
-- liquidate_position: force-close a leveraged long
-- Returns cash proceeds minus borrowed repayment, no fee.
-- ------------------------------------------------------------
create or replace function public.liquidate_position(
  p_user_id   uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_shares     integer;
  v_price      numeric;
  v_borrowed   numeric;
  v_proceeds   numeric;
begin
  select h.shares, pl.price, h.borrowed_amount
  into v_shares, v_price, v_borrowed
  from public.holdings h
  join public.players pl on pl.id = h.player_id
  where h.user_id = p_user_id and h.player_id = p_player_id
  for update;

  if not found then return; end if;

  v_proceeds := greatest(v_shares * v_price - v_borrowed, 0);

  delete from public.holdings
  where user_id = p_user_id and player_id = p_player_id;

  update public.portfolios
  set cash = cash + v_proceeds
  where user_id = p_user_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (p_user_id, p_player_id, 'SELL', v_shares, v_price, 0);
end;
$$;

-- Only service_role can trigger liquidations
revoke execute on function public.liquidate_position(uuid, uuid) from authenticated, anon;
grant  execute on function public.liquidate_position(uuid, uuid) to service_role;


-- ------------------------------------------------------------
-- liquidate_short: force-close a short at current price
-- User loses collateral on excess loss, no fee.
-- ------------------------------------------------------------
create or replace function public.liquidate_short(
  p_user_id  uuid,
  p_short_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_shares     integer;
  v_open_price numeric;
  v_collateral numeric;
  v_player_id  uuid;
  v_price      numeric;
  v_pnl        numeric;
  v_return     numeric;
begin
  select sp.shares, sp.open_price, sp.collateral, sp.player_id, pl.price
  into v_shares, v_open_price, v_collateral, v_player_id, v_price
  from public.short_positions sp
  join public.players pl on pl.id = sp.player_id
  where sp.id = p_short_id and sp.user_id = p_user_id
  for update;

  if not found then return; end if;

  -- P&L = (open - current) × shares  — negative because price rose above liq
  v_pnl    := (v_open_price - v_price) * v_shares;
  -- return what's left of collateral after absorbing the loss
  v_return := greatest(v_collateral + v_pnl, 0);

  delete from public.short_positions
  where id = p_short_id;

  update public.portfolios
  set cash = cash + v_return
  where user_id = p_user_id;

  insert into public.trades (user_id, player_id, side, shares, price, fee)
  values (p_user_id, v_player_id, 'COVER', v_shares, v_price, 0);
end;
$$;

revoke execute on function public.liquidate_short(uuid, uuid) from authenticated, anon;
grant  execute on function public.liquidate_short(uuid, uuid) to service_role;
