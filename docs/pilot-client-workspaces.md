# Client subaccounts pilot

## Availability

`/laboratorio/subcontas` is a restricted product pilot. The menu is visible only when `agency_pilot_status()` returns true. Direct URLs are guarded too. Enrollment lives in `agency_private.pilot_accounts`, which has no browser grants. End users cannot enable global enrollment via profile metadata, arbitrary membership writes or request parameters; explicit workspace invitations grant only that workspace. Enrollment is per user, not per agency. Do not publish the actual enrolled identity here.

The database checks the allowlist on every workspace operation. Disabling an enrollment immediately denies data access even if a browser still has a cached menu. The public status RPC returns only the requesting user's boolean. Privileged policy helpers live in the unexposed `agency_private` schema, have fixed search paths, check `auth.uid()` and accept no arbitrary acting-user parameter.

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
| Pilot eligibility | `src/hooks/usePilotAccess.ts`, `agency_private.pilot_accounts`, `agency_pilot_status()` |
| Workspace shell, selector, dashboard and CRM | `src/pages/PilotWorkspaces.tsx` |
| Create/edit dialogs | `src/components/pilot/WorkspaceDialogs.tsx` |
| Scoped queries, models and readable errors | `src/lib/clientWorkspaces.ts` |
| New tables, permissions and RPCs | `supabase/migrations/20261113190913_pilot_client_workspaces.sql` |
| RLS/role/legacy preservation checks | `tests/pilot-workspaces-db.mjs` |
| Browser → database flow | `tests/pilot-workspaces-browser.mjs` |

The organization is derived from the authenticated owner when creating a subaccount. Workspace owner and organization cannot be reassigned by editing a row. Leads, stages and pipelines cannot be transferred between workspaces by changing `workspace_id`. Composite foreign keys reject leads linked to another workspace's stage or pipeline.

Roles `owner`, `admin`, `agent` and `viewer` are modeled in `agency_workspace_members`. A viewer is read-only. The product owner explicitly authorized workspace-scoped invitations: a confirmed invited email may accept access to that workspace without being enrolled in the private pilot allowlist. Disabling the owning pilot still removes access for its workspace members. Removing a membership immediately removes that scope. Invitations cannot grant access to another workspace or the agency.

## Connected commercial modules

See [the reference and implementation map](chronos-reference-map.md) for scope, current behavior and provider prerequisites. Public workspace forms use `/captura/:token`, booking uses `/reservar/:token`, and authenticated invitation acceptance uses `/convite-equipe/:token`. Legacy forms and agency endpoints are unchanged.

Module source: `src/components/pilot/WorkspaceCommercial.tsx`, `WorkspaceForms.tsx`, `WorkspaceScheduling.tsx`, `WorkspaceFlows.tsx`, `WorkspaceTeam.tsx`, `WorkspaceConversations.tsx`, `WorkspaceIntegrations.tsx`; `src/lib/workspaceCommercial.ts`; `src/pages/WorkspacePublic.tsx`. The Edge entry point is `supabase/functions/workspace-operations/index.ts`. Database changes are in the additive workspace commercial/integrations/scheduler migrations.

Timers and internal actions run each minute through `pilot-workspace-automations`. The separate workspace outbox worker sends queued WhatsApp messages only for the enabled pilot owner's active workspace and bound connected number. Provider ambiguity is marked uncertain and never blindly retried. Google sync has its own scoped worker capability and job. These jobs do not call or modify the legacy agency/Vértice message bridge.

## Operations

Use Supabase Auth's supported signup/admin interfaces to provision accounts. Do not insert or hash credentials manually in Auth tables. Passwords belong to Auth and a password manager, never this repository. Enrollment is an administrative operation on the private allowlist after confirming the intended user. Do not auto-enroll signups or match user-editable metadata.

Tests use synthetic users and local PGlite databases. They do not send emails, write to production or message WhatsApp contacts. A denied/non-pilot identity, foreign workspace IDs, read-only roles, archive restrictions and unchanged legacy records are part of the database suite.
