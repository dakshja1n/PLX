-- ============================================================
-- PlX — net_worth_history table
-- Populated by the daily cron — one row per user per day
-- ============================================================

create table if not exists public.net_worth_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  net_worth   numeric not null,
  recorded_at timestamptz not null default now()
);

alter table public.net_worth_history enable row level security;

create policy "Users read own net worth history"
  on public.net_worth_history for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.net_worth_history to authenticated;
grant all    on public.net_worth_history to service_role;

create index if not exists net_worth_history_user_recorded
  on public.net_worth_history (user_id, recorded_at desc);
