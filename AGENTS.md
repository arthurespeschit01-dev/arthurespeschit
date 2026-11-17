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

- Invited identities use workspace-only access stored server-side in agency_private.workspace_only_users. Do not auto-provision an agency for invited signup, infer access from user_metadata, render AppLayout before agency_login_access allows it, or grant invitations organization membership. Keep legacy restrictive RLS and module/workspace checks. Revocation must not unlock Central. Normal independent agency owners retain their existing access.

- MCP connections are created only by an independent agency owner, never workspace-only invitees. Preserve explicit include_agency + owned client-workspace selections, per-tool scopes, current owner/status checks, hashed opaque credentials, PKCE/code single-use and refresh rotation. Credential resolution and delegated tool RPCs are service-only. Do not add raw SQL, integration-secret access or external-message sends to MCP without an explicit new scope and user instruction. See docs/central-mcp.md.
- Meeting minutes belong to the agency client model and require both the current agency identity and ownership of their parent client. Keep revision checks and immutable author/client binding; do not expose them through public client portals by default.
