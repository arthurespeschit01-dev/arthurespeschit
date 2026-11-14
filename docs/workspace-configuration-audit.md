# Pilot workspace configuration audit

These features are restricted to the existing pilot owner and explicitly invited workspace members. No legacy agency, Vértice, WhatsApp bridge, finance or client records are migrated or copied.

## Roles and members

The Workspace page has Functions and Members tabs. Managers can create named/color-coded roles, set administrator-total or per-module access levels, assign multiple roles to workspace members, and configure event notifications. Role permissions are enforced by PostgreSQL policies and checked by Edge operations. Multiple roles combine grants. The owning user always retains access. Existing base roles remain unchanged until a custom role is assigned; removing all custom roles restores that member's base role. Only the workspace owner, baseline administrators without restrictive roles, and Administrator-total roles administer member access and roles. Managing integration settings alone cannot grant or change member privileges.

Notifications implemented here are lead assignment (the assignee), stage changes, bookings and cancellations/reschedules. They create personal notification rows readable only by that member. This pilot has no contracts or payment ledger; there are no decorative switches pretending those events exist.

## Form builder

Fullscreen editor: question list, central live preview, property/logic panel, device widths, insert/delete/reorder, required fields, help text, placeholders, button labels, welcome and ending, colors/fonts/alignment, public step or all-question layout, CRM mapping and conditional visibility. Types: short/long text, contact fields, URL, address, single/multiple choice, dropdown, yes/no, rating, number and date. Multi-choice answers are stored as a JSON string of selected options and validated on the server.

Legacy agency forms keep their old renderer. Workspace public forms validate known fields and choices, ignore hidden answers, enforce contact mapping and preserve submission idempotency. Capturing a lead requires mandatory, unconditional name and phone or email. Reordering cannot put a condition before its dependency. No submitted HTML is executed.

## Ads and attribution

Meta connection and Click-to-WhatsApp lead destination are separate settings. A real provider referral controls the Meta destination; normal messages still use the connection default. Existing leads keep their stage.

Links support optional public short names, connected/manual WhatsApp destinations, initial message, visible or zero-width reference, default CRM stage and optional creation of new opportunities. Incoming ad UTMs take precedence over fixed link tagging. A script can be copied into the external site or Tag Manager to carry click IDs and UTMs from a WhatsApp button to the redirect and subsequently the received message. Browser storage lasts 90 days; attribution requires the sent reference. Invisible characters may be stripped by a client, so a visible option remains available.

Google supports the existing Data Manager API and a separate revocable HTTPS CSV capability. The two delivery paths are mutually exclusive. The CSV contains eligible gclid conversions using the configured Google conversion name, stable click/time/name/value/currency, and no contact PII. Repeated fetches return stable rows suitable for Google's import deduplication; a fetch is recorded as a consultation, never falsely marked accepted. Users must create the conversion action and scheduled source in Google Ads and inspect the actual import result there. Rows without gclid are excluded from this CSV.

AI rules classify actual text from the same contact/account using AI Gateway and an explicit company key. They have a daily cap (America/Sao_Paulo), opt-in enablement, strict boolean output, durable claims, idempotent conversion actions, and recorded errors. They do not infer audio/image contents. Text is sent externally only after activation; no key is returned to the browser. Ambiguous/interrupted requests are not automatically charged again. Model decisions can be wrong and should be evaluated against the company's criteria before using them for sales attribution.

## Funnel catalog

| Option | Configurable behavior / prerequisite |
| --- | --- |
| Form submitted | Specific active form or any active workspace form |
| Meta lead form | Optional actual Meta form ID; signed provider webhook and lead retrieval |
| Appointment created | Selected calendar or any active calendar |
| Lead created | Pipeline, entry stage, source and required tag |
| Stage changed | Destination pipeline/stage and optional prior stage |
| Tag added | Chosen tag, normalized case/accents |
| WhatsApp message | Origin account/direction, first contact/burst/all, ad-only and text filters |
| External webhook | Dedicated capability, field mapping, destination, enablement and receipts |
| Standard stage | Name and description, organization only |
| Conditional stage | Actual condition rules and yes/no outputs |
| If/else | AND/OR conditions, operators, field/form answer, branch connections |
| Timer | Duration |
| Wait for contact reply | Deadline, anchor, account, immediate/deadline check, filters and grouping |
| Team responded | Same controls with response/no-response outputs |
| Wait for appointment | Calendar filter and minutes before an actual confirmed booking |
| Business hours | Weekdays, start/end and valid timezone |
| Split | Named outputs and weights totaling 100%; stable assignment per lead |
| Send WhatsApp | Text/templates and scoped uploaded file/recorded audio; connected number |
| Send appointment | Calendar selector; real upcoming booking; interoperable .ics attachment |
| Create group | Name/template and validated participant phone list; provider support required |
| Add participants | Explicit group ID or an earlier create-group node, validated phone list |
| Send email | Subject/content and enabled company sender/provider |
| Send SMS | Text up to 160 characters and enabled company provider |
| Create task | Title, deadline and scoped assignee |
| Move CRM | Scoped destination stage/pipeline |
| Notify team | Internal notification text/template visible in workspace notifications |
| Distribute | Scoped attendants; least assigned count and deterministic tie |
| Assign owner | Selected workspace attendant |
| Add/remove tags | Explicit tag lists |
| Meta conversion | Event name and actual lead attribution; enabled provider |

The editor can verify prerequisites before activation. New saved definitions carry configuration version 3; enabled definitions are checked again in PostgreSQL. Incomplete drafts can be saved disabled. Existing snapshots retain their behavior until edited. Runtime-only conditions (e.g. a future booking or a valid customer email) are explicitly reported when absent; no test can guarantee a third-party account will always be available.

## Verification

`workspace-expansion-db.mjs` applies actual PostgreSQL migrations and tests custom role denial/allowance, notifications, invalid form schemas, Google feed exclusivity and key rotation, AI claims/deduplication, and all preceding trigger/reply isolation cases. The browser suite traverses every catalog option, saves/reopens editor drafts, creates a role, configures a conditional step form and submits it through the public UI to a real local CRM row. Edge tests mock HTTP responses for provider and AI behavior. Production checks are read-only or discard unsaved editor changes; no synthetic customer messages, conversions or leads are inserted there.
