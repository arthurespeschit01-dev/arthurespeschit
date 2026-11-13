-- A page cursor never declares replay complete or skips unprocessed events.
alter table public.agency_whatsapp_connections add column replay_offset integer not null default 0 check(replay_offset>=0);
