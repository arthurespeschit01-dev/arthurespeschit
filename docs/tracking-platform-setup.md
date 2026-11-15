# Tracking links and platform setup

## Public format

- Direct link: `https://www.centraldogestor.site/functions/v1/link-rastreavel/google-comercial`
- Site head snippet: `<script async src="https://www.centraldogestor.site/rastreio.js?link=google-comercial"></script>`

`google-comercial` is an example: create a link with that short name before using it. The Central uses its own domain and services, not Chronos endpoints. Existing token/query links remain valid. Public slugs and tokens locate only enabled links under active pilot workspaces. No public access to private settings or credentials is added.

The script can load asynchronously in the head before any buttons exist. A delegated click listener handles existing and later-rendered WhatsApp anchors. It preserves the button text, captures campaign/click identifiers, and supports a per-button `data-central-link="other-slug"` override. `_fbp` is reused when present; `fbc` is derived only from a real incoming `fbclid`. Browser tracking is subject to consent, blockers and storage availability.

## What the system can prove

A click is recorded on the server redirect. A conversation is attributed only when a WhatsApp message containing the visible/invisible reference reaches the bound workspace receiver. Removing that reference can prevent attribution. A CRM stage/message rule then queues the selected conversion. A platform API response or Google import diagnostic is needed to establish acceptance; a tracked link or CSV download is not evidence of an attributed conversion or a campaign optimization result.

Current pilot audit found no Meta/Google provider configuration rows. Platform deliveries are therefore not configured yet. Do not claim the release sends live conversions until configuration and external verification are complete.

## Required for the first client

| Area | Required setup | Verification |
| --- | --- | --- |
| Site | HTTPS domain; access to site head or GTM; one Central tracking snippet; Google auto-tagging; consent/privacy configuration; Meta Pixel/Google tag when using browser/enhanced measurement | Visit a real tagged landing page, follow a WhatsApp button, preserve text and IDs |
| WhatsApp | Workspace-bound connected number and working incoming-message webhook | Send a controlled test message with the reference and confirm one attributed conversation |
| CRM | Correct pipeline/stage destination and explicit rules for conversation, qualified lead and sale; value/currency for sale | Move a test lead and inspect the queued event and delivery result |
| Meta | Business portfolio and permissions; ad account; dataset/Pixel ID; Conversions API access token; temporary Test Events code; browser Pixel if using browser measurement | Event received in Test Events; diagnostics, matching quality and attribution checked in Meta |
| Google via API | Ads customer ID, conversion action, Google Cloud project, Data Manager API enabled, OAuth web client/consent screen, offline refresh token with `https://www.googleapis.com/auth/datamanager`, account access | Data Manager ingestion diagnostics and conversion action diagnostics; not merely a successful HTTP call |
| Google via file | Configured conversion action plus Data Manager HTTPS scheduled import of the protected CSV feed | Import preview, schedule and row-level diagnostics in Google; feed currently supports GCLID rows only |

Choose API or feed for Google; do not deliver the same business event through both. The existing feed read counter means Google fetched rows, not that Google accepted/attributed them. Preserve `gclid`, `gbraid`, `wbraid`, `fbclid`, UTMs and reference across the redirect. The API path supports the Google click identifiers; enhanced customer-data matching is a separate improvement to validate before advertising it as supported.

## Apps and approvals

For an initial manually configured Meta CAPI connection, obtain dataset access and a CAPI token using the business's authorized setup. A custom multi-client signup app is not the same requirement as sending an event with an existing token. To offer automatic customer onboarding, create/configure the appropriate Meta business app, required permissions/access review and business verification. Lead Ads form retrieval needs page access and lead permissions. Official WhatsApp Cloud API requires its separate app/WABA/number/onboarding and is not provided by the tracking script or CAPI token.

For Google API access, a Cloud project and authentication configuration are required. A commercial platform acting for external advertisers uses per-user OAuth refresh tokens and must complete Google's applicable OAuth verification before public launch. Do not build a new offline conversion integration around legacy `UploadClickConversions`; current official guidance directs new integrations to Data Manager API.

## Best-result follow-up

- Validate actual end-to-end events against the customer's platform diagnostics, including rejected events, deduplication and attribution windows.
- Keep distinct outcomes: button click, conversation received, qualified lead and completed sale. Optimize toward the intended business outcome.
- Never add private credentials to the website snippet. Keep provider secrets server-side per workspace.
- For Pixel plus CAPI reporting of the same event, align event name/event ID for deduplication. The current CRM CAPI event IDs are server outbox IDs; do not assume they deduplicate arbitrary browser events.
- Add enhanced Google customer-data matching only after its consent, hashing, API schema and diagnostics are implemented and tested. GA4 is optional for reporting and does not replace Ads conversion ingestion.

Official references checked 2026-11-15:

- https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/
- https://developers.facebook.com/docs/facebook-business-extension/fbe/get-started/pixel-capi-onboarding
- https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access
- https://developers.google.com/data-manager/api/devguides/concepts/deploy
- https://developers.google.com/google-ads/api/docs/conversions/upload-offline
- https://support.google.com/google-ads/answer/2998031
