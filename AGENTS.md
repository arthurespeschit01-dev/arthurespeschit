# Central do Gestor: working rules

- Production has active agency users and business data. Preserve their clients, tasks, finance, integrations, credentials and conversations.
- The owner authorized general release of all client-subaccount functionality. `/subcontas/*` is a standard authenticated product area for all accounts. Do not restore pilot enrollment gates. Keep owner/member/module authorization in PostgreSQL RLS. Legacy `/laboratorio/subcontas/*` URLs redirect to the canonical routes.
- Users may create subaccounts only under their own organization. Explicit invitations grant access only to the selected workspace. General availability does not grant access to another account, another workspace, credentials or organization/team membership.
- Never put real account emails, user IDs, passwords, access tokens or service-role keys into this public repository. Use private database enrollment, Auth, environment secrets and synthetic test fixtures.
- The client workspace data model is separate from the legacy agency model. Do not point workspace queries at agency clients, financial data, WhatsApp credentials or commercial cards. Scope queries, mutations and cache keys to the authenticated user and the selected workspace.
- Read `docs/pilot-client-workspaces.md` before extending subaccounts. New modules must use the same workspace boundaries; WhatsApp, forms and calendars must not reuse global agency connections.
- Apply additive migrations, test RLS with actual PostgreSQL behavior and verify original fixture rows are unchanged. Do not wipe or reseed production to test a feature.
- Keep complete WhatsApp history and provider/account isolation intact when modifying integrations.

- Main-account collaboration uses the explicit private agency_account_workspaces binding and /conta/* routes. Its owner-only context and permission-checked adapters may synchronize that owner’s commercial CRM, calendar and legacy form summaries. This exception never applies to client subaccounts, financial data, global WhatsApp credentials or history. Keep the binding server-controlled.
