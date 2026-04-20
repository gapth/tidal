create table if not exists public.fan_scores (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users (id) on delete cascade,
  fan_id         uuid not null references public.fans (id) on delete cascade,
  score          int not null,
  breakdown      jsonb not null,
  computed_at    timestamptz not null default now(),
  constraint fan_scores_owner_fan_unique unique (owner_user_id, fan_id)
);

create index if not exists fan_scores_owner_score_idx
  on public.fan_scores (owner_user_id, score desc);

alter table public.fan_scores enable row level security;

drop policy if exists fan_scores_select_own on public.fan_scores;
create policy fan_scores_select_own
  on public.fan_scores
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists fan_scores_insert_own on public.fan_scores;
create policy fan_scores_insert_own
  on public.fan_scores
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists fan_scores_update_own on public.fan_scores;
create policy fan_scores_update_own
  on public.fan_scores
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists fan_scores_delete_own on public.fan_scores;
create policy fan_scores_delete_own
  on public.fan_scores
  for delete
  using (auth.uid() = owner_user_id);
