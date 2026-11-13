# Central do Gestor: working rules

- Production has active agency users and business data. Preserve their clients, tasks, finance, integrations, credentials and conversations.
- New experimental product features must remain inside the pilot area (`/laboratorio/*`) until the owner explicitly authorizes rollout. Hide entry points with `usePilotAccess` and enforce access in PostgreSQL using the private pilot allowlist and workspace RLS. A hidden menu alone is insufficient.
- Explicitly invited users may access only their authorized workspace; the owner approved this exception. Never enroll another user, the main agency account or an entire organization in the global pilot implicitly. Pilot membership is administered privately, separately from organization/team membership.
- Never put real account emails, user IDs, passwords, access tokens or service-role keys into this public repository. Use private database enrollment, Auth, environment secrets and synthetic test fixtures.
- The pilot client workspace data model is separate from the legacy agency model. Do not point pilot queries at agency clients, financial data, WhatsApp credentials or commercial cards. Scope queries, mutations and cache keys to the authenticated user and the selected workspace.
- Read `docs/pilot-client-workspaces.md` before extending subaccounts. New modules must use the same workspace boundaries; WhatsApp, forms and calendars must not reuse global agency connections.
- Apply additive migrations, test RLS with actual PostgreSQL behavior and verify original fixture rows are unchanged. Do not wipe or reseed production to test a feature.
- Keep complete WhatsApp history and provider/account isolation intact when modifying integrations.
