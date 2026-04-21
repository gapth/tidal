create table if not exists public.fan_predictions (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users (id) on delete cascade,
  fan_id         uuid not null references public.fans (id) on delete cascade,
  spend_prob     float not null check (spend_prob >= 0 and spend_prob <= 1),
  model_version  text not null,
  computed_at    timestamptz not null default now(),
  constraint fan_predictions_owner_fan_unique unique (owner_user_id, fan_id)
);

create index if not exists fan_predictions_owner_prob_idx
  on public.fan_predictions (owner_user_id, spend_prob desc);

alter table public.fan_predictions enable row level security;

drop policy if exists fan_predictions_select_own on public.fan_predictions;
create policy fan_predictions_select_own
  on public.fan_predictions
  for select
  using (auth.uid() = owner_user_id);
