# Complete shared WhatsApp history

Vértice's webhook previously discarded group content after forwarding it to Central. Provider-log recovery also stored content only in Central; the old mirror was called only by Central's send handler. The result was an asymmetric history despite successful webhook delivery.

Central now atomically queues every confirmed content row (inbound, outbound, groups and recovered history). Queue records contain the verified owner/sender account, direction and contact name. The existing scheduled worker retries delivery; no WhatsApp send API is used. Existing outbox receipts are retained. A one-time insert queues previously recorded history with known sender accounts without rewriting conversations or guessing unclassified sender numbers. Private trigger privileges, a fixed search path and matching account ownership prevent cross-account routing.

Vértice accepts both directions through a new service-only, idempotent RPC, preserving group addresses/names. Existing authenticated bridge and instance checks remain. Group webhooks now record group conversations and never enter the inbound AI/n8n automation. Vértice also recovers conversation and open-chat state automatically every five seconds while visible, on focus and on tab return, in addition to Realtime.

Verification: PGlite tests cover transactional queue/backfill, unchanged source history, ownership, confirmed-send transitions, deduplication, direction, groups/names and denied browser-role RPC access. Vértice's webhook tests cover inbound/outbound groups, unchanged direct-message forwarding, rejected credentials/instances and zero WhatsApp sends during history acceptance. No test messages are sent to real contacts.
