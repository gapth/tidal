create table sessions (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  youtube_url text not null,
  status text not null default 'active',
  created_at timestamptz default now()
);

create table prompts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  source text not null,
  category text not null,
  content text not null,
  dismissed boolean default false,
  created_at timestamptz default now()
);

-- No RLS — POC is single-user, allowlisted access
grant all on sessions to anon, authenticated, service_role;
grant all on prompts to anon, authenticated, service_role;
