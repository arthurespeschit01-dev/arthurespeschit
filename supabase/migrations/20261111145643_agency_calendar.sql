-- These tables are service-only: provider credentials never reach browser clients.
create table public.agency_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.agency_calendar_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index agency_calendar_states_owner on public.agency_calendar_states(user_id);
create index agency_calendar_states_expiry on public.agency_calendar_states(expires_at);
alter table public.agency_calendar_connections enable row level security;
alter table public.agency_calendar_states enable row level security;
revoke all on public.agency_calendar_connections, public.agency_calendar_states from public, anon, authenticated;
grant select, insert, update, delete on public.agency_calendar_connections, public.agency_calendar_states to service_role;
