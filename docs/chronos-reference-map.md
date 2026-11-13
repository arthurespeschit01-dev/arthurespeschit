# Client commercial workspace: reference and behavior

The reference is Chronos Dock (`https://chronosdock.com/`) and the screenshots supplied by the product owner. The screenshots, rather than similarly named Kronos products or inaccessible authenticated pages, define this implementation. This is a scoped implementation of the requested workflows, not a claim of feature parity with the entire Chronos product.

| Reference | Implementation | Connected behavior |
| --- | --- | --- |
| Company selector | Pilot workspace selector | Every query, role, credential and mutation belongs to that company |
| Commercial dashboard | Dashboard plus CRM distribution | Real form views/responses/review state, appointments, successful/failed automation runs, tasks and notifications |
| CRM / pipelines | Existing workspace CRM extended with source and tags | Forms, bookings, new WhatsApp contacts and authenticated external intake capture leads; matching contacts retain their current stage |
| Forms | Field builder, conditions, preview, entry stage, public link, activation/deletion and response history | Public responses are validated server-side, snapshotted, deduplicated by request and emit automation events |
| Appointments | Calendar availability, timezone, duration/buffer, public booking, internal booking and attendance status | Conflicting bookings are rejected atomically; contacts enter the CRM; optional company-owned Google OAuth publishes events and checks busy times |
| Visual funnels | Visual canvas, trigger/condition/action palette, node settings, edges, activation and execution history | Durable runs snapshot the graph/version; tags, CRM moves, assignments, tasks, notifications, waits and connected WhatsApp sends execute on the server |
| People and permissions | Invitation links bound to a confirmed Auth email and workspace; owner/admin/agent/viewer | Acceptance adds only the invited membership; removal revokes it immediately; members cannot enroll themselves in the global pilot |
| Conversations | Workspace-owned W-API instance, received/delivery webhooks, account-scoped inbox and sending | New events are ingested idempotently; outgoing sends use a durable outbox; the interface refreshes automatically |
| Integration settings | Private W-API/Google/external-webhook credentials | Existing agency and Vértice connections are never reconfigured or reused |

## Scope distinctions

- CRM pipelines describe a lead's stage; visual funnels describe automation execution. They are separate resources.
- Workspace creation installs a real public capture form, a booking calendar and an editable, active **internal-only** form → tag → task → notification funnel. No fictitious responses, contacts, appointments or messages are created.
- A webhook URL is an integration secret. It accepts a unique request UUID and a validated contact, scoped by the server-side capability, not a caller-provided workspace.
- W-API configuration is for an exclusive instance. Existing callbacks are preserved if they belong elsewhere. Phone-sent messages require the provider's delivery event. Historical messages before activation are not imported. This first workspace inbox supports text messages; it does not claim the legacy agency inbox's media/avatar/history migration features.
- Google requires configured OAuth credentials and this function's exact redirect URI authorized in Google Cloud. The connected primary calendar receives appointments; public availability also checks its busy intervals. Sync failures are recorded and retried; local appointment edits retain precedence. Google/provider approval is external and is never reported as granted automatically.
- Meta App Review, official WhatsApp Cloud API onboarding, ad attribution/conversion reporting, subscription billing, credits and SMS are not implied by these screens. The reference screenshots include those products, but they require separate provider setup and a dedicated release. The generic external intake can receive contacts today; it is not labeled as an approved Meta integration.

## Verification

`tests/workspace-commercial-db.mjs` exercises actual PostgreSQL semantics locally: form capture/deduplication, event execution, tags/tasks/notifications, booking conflicts, invalid graph cycles, account-bound webhook idempotence, credential denial, invited-member isolation, wrong-email acceptance denial and revocation. `tests/pilot-workspaces-browser.mjs` exercises the browser against scoped local PostgreSQL queries, including form conditions, visual canvas, invitations, CRM operations, mobile width and preserved legacy fixture records. Edge tests cover conditional answer validation and timezone/buffer/occupied booking slots. No test sends production messages or creates production business records.
