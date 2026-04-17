create extension if not exists pgcrypto;

create table if not exists public.fans (
  id uuid primary key default gen_random_uuid(),
  yt_id text not null unique,
  name text
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  yt_id text not null unique,
  yt_video_id text not null,
  fan_id uuid not null references public.fans (id) on delete cascade,
  text text,
  time timestamptz not null
);

create index if not exists messages_fan_id_idx on public.messages (fan_id);
create index if not exists messages_time_idx on public.messages (time desc);
create index if not exists messages_yt_video_id_idx on public.messages (yt_video_id);
