# Pilot workflow, QR and tracking usability

Scope: client workspaces under `/laboratorio/*`; existing pilot access checks and workspace RLS remain unchanged. No schema changes or legacy integration writes.

## Delivered

- Workflow save keeps the editor open. Diagram undo/redo includes nodes and connections together; keyboard shortcuts ignore text fields.
- Adding a step after a selected block connects its available single output automatically. Conditional outputs have explicit insertion controls. Drop on canvas remains manual.
- New steps avoid overlap. Invalid outlets, duplicate outgoing connections and cycles are rejected immediately. Opening configuration panels no longer resets the viewport; an explicit fit control is available.
- WhatsApp QR appears in an in-system dialog, can be refreshed, and connection status is checked while it is open. Disconnect requires confirmation and preserves stored conversations.
- W-API QR requests use `image=enable`, as documented in the provider's official Postman collection: https://www.postman.com/w-api/w-api-api-do-whatsapp/request/1mbuqxv/conectar-com-qrcode . JSON/base64 and binary PNG/JPEG/WebP are normalized; arbitrary URLs/SVG are refused.
- Tracking links use a separate create/edit dialog and installation dialog. Per-link and aggregate click/conversation counts use the same 30-day reporting window. Existing server redirect, attribution, incoming-message matching and site script remain in place.

## Verification and limits

The browser regression uses an isolated PostgreSQL fixture and intercepted provider calls: it exercises editor history, connected-step insertion, save continuity, QR rendering and status transition, and tracking destination selection. Existing fixture data and nonpilot access checks remain in the suite. Unit tests cover diagram cycles/branches, history, site script attribution and workflow transfer; provider-contract tests cover QR formats and request parameters. No real customer session is reconnected and no real messages are sent during verification.

Official WhatsApp Cloud API is still a separate integration to implement. The owner confirmed no Meta app or enabled number exists yet. Existing Meta conversion tracking settings do not connect a WhatsApp number. Embedded Signup requires app configuration, appropriate permissions/review, a WABA/number and registration; a QR provider session does not satisfy those requirements. Do not present the official channel as ready.
