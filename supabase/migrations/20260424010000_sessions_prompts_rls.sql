-- Track which user owns each session
alter table public.sessions
  add column owner_user_id uuid references auth.users(id) on delete cascade;

-- Enable RLS
alter table public.sessions enable row level security;
alter table public.prompts enable row level security;

-- Tighten grants — service_role bypasses RLS; anon should not have access
revoke all on public.sessions from anon;
revoke all on public.prompts from anon;

-- Sessions: owner CRUD
create policy sessions_select_own on public.sessions
  for select using (auth.uid() = owner_user_id);

create policy sessions_insert_own on public.sessions
  for insert with check (auth.uid() = owner_user_id);

create policy sessions_update_own on public.sessions
  for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy sessions_delete_own on public.sessions
  for delete using (auth.uid() = owner_user_id);

-- Prompts: accessible when the linked session belongs to the user.
-- service_role (worker inserts) bypasses RLS.
create policy prompts_select_own on public.prompts
  for select using (
    exists (select 1 from public.sessions s where s.id = session_id and s.owner_user_id = auth.uid())
  );

create policy prompts_update_own on public.prompts
  for update using (
    exists (select 1 from public.sessions s where s.id = session_id and s.owner_user_id = auth.uid())
  );
