-- Track delivery-event activation without modifying existing conversations or settings.
alter table public.agency_whatsapp_connections add column delivery_configured_at timestamptz,add column delivery_error text;
alter table public.agency_whatsapp_mirror_events add column attempted_at timestamptz,add column last_error text;
