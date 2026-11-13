# Phone sends using WhatsApp LID identities

Recent phone sends arrived as `webhookDelivery`, `fromApi:false`, with `chat.id` ending in `@lid`. The webhook and Central normalizers previously rejected that identifier, so the transport was working but the content never reached either history.

Vértice resolves an exact LID/phone pair only when it was observed in an inbound event for the same instance and connected sender number. The private, security-invoker RPC returns no mapping on ambiguity. Names, profile photos and a sender's own ID are never used as evidence of a recipient phone. The event retains the LID metadata when normalized. If no mapping exists, the complete LID remains the conversation identity and is retained, rather than discarded or stripped into a fake phone number. Directory/reconciliation events use the same resolver; recovery does not call a WhatsApp message-send API or feed outgoing events to inbound AI.

Central accepts full LIDs independently from telephone digits and only reclassifies an existing LID row when a later event/history row has the same provider ID, owner and sender account. Existing telephone/group records are unchanged by the constraint/key migration. Historical events can be replayed through the existing scheduled reconciliation, preserving IDs and idempotency.

Tests cover resolved/unresolved phone events, forwarded content, no outgoing AI loops, account/instance isolation, ambiguous mappings, malformed identifiers, private RPC access, duplicate recovery scoping and unchanged legacy phones. No customer test messages are sent.
