-- Development schema for Kiru Supabase persistence.
-- Run this in the Supabase SQL editor when enabling full remote persistence.

create table if not exists public.calls (
  id text primary key,
  task_type text,
  target_phone text,
  objective text,
  context text,
  run_id text,
  run_mode text,
  location text,
  target_name text,
  target_url text,
  target_source text,
  target_snippet text,
  target_outcome text,
  walkaway_point text,
  agent_persona text,
  opening_line text,
  style text,
  status text,
  outcome text,
  duration_seconds integer default 0,
  created_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz
);

create table if not exists public.chat_sessions (
  id text primary key,
  mode text not null,
  revision integer not null default 0,
  run_id text,
  task_ids_json jsonb not null default '[]'::jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_mode_updated_at
  on public.chat_sessions (mode, updated_at desc);

create table if not exists public.call_artifacts (
  task_id text primary key references public.calls(id) on delete cascade,
  transcript_json jsonb not null default '[]'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  recording_json jsonb not null default '{}'::jsonb,
  audio_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_call_artifacts_updated_at
  on public.call_artifacts (updated_at desc);

-- Enable RLS on all tables. The backend uses the service_role key which
-- bypasses RLS, so no permissive policies are needed. This locks out the
-- public anon key from reading or writing any data.
alter table public.calls enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.call_artifacts enable row level security;

-- No policies = anon key is fully blocked.
-- The service_role key bypasses RLS by default in Supabase.
