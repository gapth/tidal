alter table public.fans
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

alter table public.messages
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

alter table public.fans
  alter column owner_user_id set not null;

alter table public.messages
  alter column owner_user_id set not null;

alter table public.fans
  drop constraint if exists fans_yt_id_key;

alter table public.messages
  drop constraint if exists messages_yt_id_key;

create unique index if not exists fans_owner_user_id_yt_id_idx
  on public.fans (owner_user_id, yt_id);

create unique index if not exists messages_owner_user_id_yt_id_idx
  on public.messages (owner_user_id, yt_id);

alter table public.fans enable row level security;
alter table public.messages enable row level security;

drop policy if exists fans_select_own on public.fans;
create policy fans_select_own
  on public.fans
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists fans_insert_own on public.fans;
create policy fans_insert_own
  on public.fans
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists fans_update_own on public.fans;
create policy fans_update_own
  on public.fans
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists fans_delete_own on public.fans;
create policy fans_delete_own
  on public.fans
  for delete
  using (auth.uid() = owner_user_id);

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
  on public.messages
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own
  on public.messages
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
  on public.messages
  for delete
  using (auth.uid() = owner_user_id);
