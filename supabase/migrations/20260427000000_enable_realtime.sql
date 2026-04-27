do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'prompts'
  ) then
    alter publication supabase_realtime add table public.prompts;
  end if;
end $$;
