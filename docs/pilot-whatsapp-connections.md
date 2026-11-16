# Pilot WhatsApp connections

## Scope and functional paths

The WhatsApp page under `/laboratorio/*` separates QR Code and official Meta Cloud API. A workspace has one primary transport in this release. Switching requires first disabling its current connection; message history is retained. Extra simultaneous numbers, subscription billing and historical import are not provided by this release and are not presented as working controls.

### QR Code / W-API

An exclusive W-API instance and token are required. Never reuse or reconfigure the agency's legacy instance. The manager saves a workspace-owned instance, verifies its webhook ownership, then activates both incoming and outgoing event callbacks. QR generation uses the documented image mode. Connection polling confirms the actual provider state; invalid credentials or callback mismatches stop setup.

A manager can issue a 15-minute delegated connection link after verifying the instance. The public `/conectar-whatsapp/:token` page can request the QR and poll connection status. It cannot read messages, users, leads or credentials. The capability is bound to the workspace and current instance, invalidated when regenerated, rate-limited to 240 lookups and refused after expiry, workspace disable, transport switch or connection replacement. The share link does not require adding a pilot member.

### Official Meta Cloud API

The implementation uses Facebook Login for Business with a **v4** configuration. Its server-issued nonce is scoped to workspace and authenticated administrator, expires after 10 minutes and is consumed once. The authorization code is exchanged server-side, and the selected phone ID is verified against the WABA granted by that token. Business-app mode requires Meta to confirm `is_on_biz_app`; normal mode registers the phone with a server-generated PIN retained privately. The app is subscribed to WABA events. Only after these calls succeed is the workspace connection enabled and its actual phone checked.

Incoming callbacks require `X-Hub-Signature-256` over the raw body using the application's secret. WABA ID and phone ID must match an enabled workspace connection. Replayed message IDs remain idempotent. New text messages and supported message descriptions/captions enter the existing scoped CRM/conversation pipeline; Business app message echoes are outgoing messages. Sender contact identity and tracking references are preserved.

Outgoing free text and outbound media use the bound Cloud API phone, the existing outbox and a recorded incoming-message window of 24 hours. Group/event actions are rejected by this transport. Approved-template initiation outside the window, inbound media-file download, historical chat/contact import and delivery/read receipt display remain outside this release; do not advertise them as implemented. HTTP errors confirmed by Meta are failures, while ambiguous deliveries are not automatically resent.

### Automatic opt-out

Both transports share configurable phrases. Case/accent-insensitive phrase matching uses word boundaries to avoid fragments such as `parar` inside `preparar`. Incoming opt-outs are stored privately per workspace/contact. Automated sends and group participant operations check the suppression record before delivery. Manual agent replies remain available and all stored history is retained. Turning off detection does not clear existing opt-outs.

## Server configuration required before real Meta onboarding

Configure these only in Supabase Edge Function secrets, never a public frontend env or chat message:

- `META_WHATSAPP_APP_ID`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_CONFIG_ID` (Facebook Login for Business **v4**, with WhatsApp Cloud API and applicable coexistence product settings)
- `META_WHATSAPP_VERIFY_TOKEN` (random, at least 16 characters)

In the Meta app:

1. Configure business identity, approved Central site domain, privacy policy, data deletion flow and the applicable Tech Provider/business verification and Advanced Access review. Permissions include `whatsapp_business_management` and `whatsapp_business_messaging`.
2. Set the callback to the **Webhook URL displayed in the official tab** and use the same verification token. Subscribe to `messages`; subscribe to `smb_message_echoes` for Business-app coexistence. The token only verifies the callback; it never replaces signature validation.
3. Use test businesses/numbers first. Real onboarding requires a number the connecting administrator is authorized to use and the permissions/billing/eligibility required by Meta. Never delete a phone's existing WhatsApp account simply to make the onboarding button proceed.
4. Complete the popup, confirm actual connected status, send a controlled incoming message, reply inside the service window, verify incoming CRM capture and outbound delivery. Check invalid signature, unauthorized workspace/phone and expiry cases.

The official tab reports activation pending and disables the connect buttons when the server application is not configured. Supplying environment fields enables the onboarding entry point; it is not proof that Meta review, number eligibility, billing or real message delivery have passed. Do not declare the connection operational before the external checks are completed.

Production audit before implementation found **no pilot connection**, while the agency had one separate legacy connection. No real number was paired or moved and no WhatsApp message was sent during automated verification. The owner previously confirmed there is no configured Meta app/Cloud number yet.

## SDK initialization and popup lifecycle

The SDK loader waits for Meta's `fbAsyncInit` callback, not the bootstrap script's `load` event. The bootstrap can expose a buffering `FB` stub; caching that object caused a pending login with no popup or callback. The initialized SDK is obtained from the current `window.FB` inside the click handler, and `FB.login` is invoked before any await/network request.

Loading has a bounded timeout and a manual retry. An authorization can be cancelled locally without submitting a late SDK result. Once the authorization is returned, the UI distinguishes server validation from popup authorization; cancellation is no longer offered during registration. Reopening the official tab refetches server configuration rather than retaining the application-wide stale cache.

## Validation

- Isolated PostgreSQL/RLS: nonce expiry/replay and workspace/user boundaries, denied browser secret access, duplicate phone rejection, active-transport replacement refusal, message deduplication, opt-out scope, W-API restoration and unchanged legacy fixtures.
- Provider contracts: HMAC validation/tampering, WABA/phone routing, coexistence echo normalization, media/text dispatch, service window refusal and phrase matching.
- Frontend: trusted origin and session event parsing, code/session join and cancellation; browser regression verifies the two tabs, honest pending state, QR display/status transition and preserved workspace/RLS behavior.
- Public pairing is verified with fixture responses/expired capabilities; no real provider session is generated in tests.

Official docs consulted:

- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
