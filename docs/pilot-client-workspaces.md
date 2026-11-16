# Client subaccounts pilot

## Availability

The owner authorized general release of all existing subaccount modules. `/subcontas` is the standard authenticated area for client subaccounts. The old `/laboratorio/subcontas/*` routes redirect while preserving path/query/hash. The menu and shared product design are available to all signed-in accounts. Authentication is checked through `agency_workspace_status()`; no allowlist enrollment is required.

Every workspace operation still enforces owner/member access and module roles in PostgreSQL. Only organization owners may create subaccounts under their own organization. Invitations grant only the selected workspace. Archive restrictions, signed public links, secret redaction, provider capabilities and account isolation are preserved. The historical `pilot_accounts` table remains private and unchanged for compatibility; it no longer controls runtime availability. Legacy RPC names remain compatible for older clients.

## Current delivery

- Create, rename, describe, archive, restore and delete independent client subaccounts.
- Switch between subaccounts without mixing form state or caches.
- Each new subaccount starts with an empty CRM, a configurable default pipeline and an owner membership. No agency rows are copied.
- Create, edit, reorder and remove pipeline stages; classify stages as open, won or lost. Occupied stages cannot be deleted.
- Create, edit, move and delete leads. Desktop drag/drop and mobile stage selectors both use scoped server writes.
- Dashboard quantities and won value derive from the selected pipeline's actual leads and stage kinds.
- Archived subaccounts remain readable; CRM mutations are denied by the database.
- All destructive actions are inside menus and require confirmation where data is permanently removed.

## Boundaries and files

| Purpose | Source |
| --- | --- |
| Product access | `src/hooks/useWorkspaceAccess.ts`, `agency_workspace_status()`, scoped workspace RLS |
| Workspace shell, selector, dashboard and CRM | `src/pages/PilotWorkspaces.tsx` |
| Create/edit dialogs | `src/components/pilot/WorkspaceDialogs.tsx` |
| Scoped queries, models and readable errors | `src/lib/clientWorkspaces.ts` |
| New tables, permissions and RPCs | `supabase/migrations/20261113190913_pilot_client_workspaces.sql` |
| RLS/role/legacy preservation checks | `tests/pilot-workspaces-db.mjs` |
| Browser → database flow | `tests/pilot-workspaces-browser.mjs` |

The organization is derived from the authenticated owner when creating a subaccount. Workspace owner and organization cannot be reassigned by editing a row. Leads, stages and pipelines cannot be transferred between workspaces by changing `workspace_id`. Composite foreign keys reject leads linked to another workspace's stage or pipeline.

Roles `owner`, `admin`, `agent` and `viewer` are modeled in `agency_workspace_members`. A viewer is read-only. A confirmed invited email may accept access only to that workspace. Removing membership immediately removes that scope; it does not remove the user’s independent ability to use their own subaccounts. Invitations cannot grant access to another workspace or the agency.

## Connected commercial modules

See [the reference and implementation map](chronos-reference-map.md) for scope, current behavior and provider prerequisites. Public workspace forms use `/captura/:token`, booking uses `/reservar/:token`, and authenticated invitation acceptance uses `/convite-equipe/:token`. Legacy forms and agency endpoints are unchanged.

Module source: `src/components/pilot/WorkspaceCommercial.tsx`, `WorkspaceForms.tsx`, `WorkspaceScheduling.tsx`, `WorkspaceFlows.tsx`, `WorkspaceTeam.tsx`, `WorkspaceConversations.tsx`, `WorkspaceIntegrations.tsx`; `src/lib/workspaceCommercial.ts`; `src/pages/WorkspacePublic.tsx`. The Edge entry point is `supabase/functions/workspace-operations/index.ts`. Database changes are in the additive workspace commercial/integrations/scheduler migrations.

Timers and internal actions run each minute through `pilot-workspace-automations`. The separate workspace outbox worker sends queued WhatsApp messages only for the enabled pilot owner's active workspace and bound connected number. Provider ambiguity is marked uncertain and never blindly retried. Google sync has its own scoped worker capability and job. These jobs do not call or modify the legacy agency/Vértice message bridge.

## Operations

Use Supabase Auth's supported signup/admin interfaces to provision accounts. Do not insert or hash credentials manually in Auth tables. Passwords belong to Auth and a password manager, never this repository. No pilot enrollment is required for product access. Never use user-editable metadata to grant workspace permissions.

Tests use synthetic users and local PGlite databases. They do not send emails, write to production or message WhatsApp contacts. A foreign-account identity, foreign workspace IDs, read-only roles, archive restrictions and unchanged legacy records are part of the database suite.

## Professional editor and tracking update

See [professional workspace workflows](workspace-professional-workflows.md) for the grouped navigation, fullscreen editor, reply/appointment/business-hour waits, multi-path splits, workspace-owned email/SMS, conversion tracking, Meta form intake and cancellation guards. Provider setup and approvals remain explicit external prerequisites.

## WhatsApp connection transports

See [pilot WhatsApp connections](pilot-whatsapp-connections.md) for separate QR/Meta setup, the Embedded Signup v4 prerequisites, delegated pairing link boundaries, private opt-out enforcement, supported paths and release limitations. A pilot workspace keeps one primary transport; switching requires disabling the current connection and never copies or moves the agency connection.

## General release verification

`20261116125048_workspace_standard_release.sql` removes the reviewed runtime allowlist joins, retains every workspace predicate/ACL, adds the standard status RPC and updates existing cron commands in place without duplicate jobs. `tests/workspace-standard-db.mjs` verifies unrestricted own-account enrollment, cross-account denial, viewer restrictions, immutable ownership, archive/anonymous denial, private settings and legacy preservation. The expansion and Cloud suites run with `STANDARD_WORKSPACES=1`; the browser suite now verifies an unenrolled account can create its own workspace while foreign workspaces remain inaccessible.

General availability does not create provider accounts or bypass Meta/Google approval requirements. Each company configures its own integrations.


## Main account and invitation delivery

The main account exposes team/roles, Calendar, tracking, channels, webhooks and usage under `/configuracoes/*`, with collaboration under `/conta/:workspace`. `agency_account_workspace()` creates an idempotent owner-bound context. Client subaccounts never receive this binding. Existing main CRM stays at its original route; scoped triggers synchronize common commercial fields in both directions. Existing WhatsApp credentials and conversation history are untouched. New confirmed text messages can feed primary-account conversion rules only when matched to an existing CRM lead. Legacy forms remain at their original route; the shared area also shows their read-only summaries.

Main Calendar keeps original appointment IDs and adds month/week/list views. Its permission-checked RPC supports authorized team access. Google uses a separately connected primary-workspace Google account, deterministic event IDs, revision-aware retries and a deletion queue; a client workspace token is never copied.

Invitations are public capability links with login/signup on the same page. Acceptance requires the confirmed invited email. A custom role is assigned atomically on acceptance with a viewer baseline, and all module access remains enforced by PostgreSQL. Existing members can receive the same roles from the team selector. Shared primary accounts appear under “Contas da equipe”.

Invitation email is sent server-side through Resend using `RESEND_API_KEY` and the verified sender `notificacoes@centraldogestor.site`. Claims serialize sends, enforce resend/rate limits and prevent arbitrary recipient changes. Provider acceptance is recorded separately from an error; the UI never treats invitation creation as email delivery. The invite link remains usable after a provider error. No live emails or Google events are sent by automated tests.

Validation: `ACCOUNT_BROWSER=1 node tests/agency-account-db.mjs`, `node tests/pilot-workspaces-browser.mjs`, and the invite/Google Deno contract tests.


## Invitation-only login isolation

`agency_login_access()` is the authenticated routing authority. Workspace-only identities never mount the Central layout; root, settings, finance and unauthorized workspace URLs redirect to their permitted workspace or own pending invitation. With no remaining access they see a sign-out screen. Workspace chrome offers sign-out, not a link to Central. Public invite authentication names the company and preserves the invitation through signup confirmation.

The private `workspace_only_users` registry is server-controlled and durable after revocation. New signup with a live email-matched invitation skips agency bootstrap; existing empty invited identities are backfilled without deleting data. Existing independent business owners are preserved. Accepting a first invitation on an empty identity establishes the same restriction. User metadata cannot override it. Legacy tables have mandatory restrictive RLS in addition to their original policies; organization/Storage membership helpers honor the restriction. New legacy tables must preserve this condition. Client workspace membership and custom module permissions are unchanged. Central WhatsApp/Calendar authenticated endpoints deny workspace-only identities before reading provider settings.

Run `npm run test:invited-access` for real PostgreSQL plus browser checks of signup, direct URL isolation, API denials, metadata spoofing, revocation and owner regressions.
