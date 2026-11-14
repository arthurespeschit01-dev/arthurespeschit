# Professional workspace workflow release

## Reference and navigation

The user's Chronos Dock screenshots define the layout: standalone Início and Conversas; a collapsible Comercial group containing Dashboard, CRM, Formulários, Agendamentos and Funis; Configurações containing Workspace and Geral. Geral is a searchable configuration hub that links company identity, people/permissions, channels, tracking and usage. The agency shell remains unchanged; this release is still restricted to the pilot and explicitly invited workspaces.

The workflow editor now occupies the viewport, with a searchable, scrollable category catalog, a large pan/zoom canvas and a selected-block settings panel. Clicking a catalog card inserts the new block in the visible canvas and centers/selects it. Drag/drop, stable node positions, duplication, deletion, server validation errors, saving drafts, unsaved-change confirmation, execution history and mobile configuration are supported. Incoming React Flow dimension/selection updates no longer replace the domain node type/data. Tests reproduce add → rename → drag → save → reopen → delete, rather than merely checking a canvas exists.

## Workflow behavior

- Triggers: form submitted, Meta lead form, appointment created, lead created, CRM stage changed, tag added, received/sent WhatsApp message, authenticated external intake.
- Organization/decision: named stage markers; multiple AND/OR condition rules; fixed waits; contact-reply and team-reply waits with success/timeout paths; waiting before a confirmed future appointment; business-hour windows with timezone; weighted splits with two to ten named paths summing to 100%.
- Internal actions: tasks, stage moves, notifications, assigning an owner, distributing to selected members by current assignment load, adding/removing tags.
- External actions: connected WhatsApp text/media/recorded audio, calendar invitation attachment, group creation and participant additions; Resend email; Twilio SMS; Meta conversion events and Google Ads click conversions through the current Data Manager API. Group actions are tied to the currently connected WhatsApp account. The calendar action sends an interoperable `.ics` attachment; it does not claim an undocumented native WhatsApp event-card API.
- Every run keeps its definition/version snapshot. Reply waits remember their entry time and wake only for later messages from the selected phone/account. Weighted splits use a stable lead/flow/node hash. External actions use a claimed, durable outbox with per-run/node or event/rule uniqueness; uncertain sends are not automatically repeated. Manual retries explicitly require reviewing uncertain delivery.
- Disabling/removing conversion rules cancels queued conversions. Disconnecting/changing the connected WhatsApp number cancels queued communications instead of replaying them on a different number or after reconnect.

## Tracking and providers

Workspace-scoped settings store credentials in a private, service-only table. The browser receives masked configuration state, never stored API tokens or secrets. Meta lead forms validate the webhook HMAC, page and configured entry stage; provider lead IDs are deduplicated. Public form submissions retain attribution parameters and trusted request metadata. WhatsApp advertisement referral metadata is retained only when actually supplied by the provider.

Conversion rules match real CRM transitions or matching incoming/outgoing messages. Meta requests hash contact identifiers, use stable event IDs and require an affirmative `events_received` response. Google Ads conversions require an actual click identifier and affirmative Data Manager request ID. New integrations use Data Manager rather than the restricted legacy UploadClickConversions endpoint. Tracking links use saved destinations and count redirects; request-supplied redirect destinations are ignored.

Email/SMS use accounts connected explicitly by the workspace administrator and configurable daily limits. Usage screens show recent recorded sends and limits, not an invented prepaid balance. The system does not purchase credits, create subscription charges, or claim Meta/Google approval. The user must supply provider credentials, verified sender/phone and external app permissions. Automated live provider sends are not performed during verification.

## Sources consulted

- User-supplied Chronos Dock screenshots and `https://chronosdock.com/` (no claim of inspecting private Chronos pages).
- HighLevel workflow wait documentation: https://help.gohighlevel.com/support/solutions/articles/155000002470-action-wait
- HighLevel split behavior: https://help.gohighlevel.com/support/solutions/articles/155000003304
- HighLevel workflow overview: https://help.gohighlevel.com/support/solutions/articles/155000002288-workflows-overview
- W-API group creation contract: https://www.postman.com/w-api/w-api-api-do-whatsapp/request/fuf0b5e/criar-grupo
- W-API participant endpoint: https://www.postman.com/w-api/w-api-api-do-whatsapp/request/f1bci7x/adicionar-participante

## Validation and release

Run `tests/workspace-professional-db.mjs` for local PostgreSQL checks, `tests/pilot-workspaces-browser.mjs` for UI → PostgreSQL checks, and `_shared/workspace-actions_test.ts` plus the existing public/Google Deno tests for mocked providers. These tests use synthetic identities and do not contact real recipients or create production business records.

Apply the professional automation migration, deploy the expanded workspace-operations bundle, then install provider scheduler and cancellation-guard migrations. Promote the frontend only after these checks. Existing agency clients, tasks, finance, conversations, provider tokens and the Central/Vértice bridge are outside this release.

Provider version references: https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest and https://developers.google.com/google-ads/api/docs/conversions/overview.
