# Email/password signup and independent accounts

The login page offers **Criar conta** with email, password (at least eight characters) and password confirmation. Google sign-in is removed. Existing email/password logins keep working, including passwords shorter than the new signup minimum. No purchase/subscription check is introduced.

Production Supabase already has email signup enabled, email confirmation required and the Google provider disabled. Signup redirects verification to `/auth/callback`; this route remains necessary for confirmation links. The UI shows a generic confirmation notice to avoid disclosing whether an address already exists. Confirm the address using the email, then log in normally. No Auth settings or database migrations are required for this frontend release.

The existing `auth.users` trigger creates a new organization and owner membership for each account. User-supplied metadata cannot assign a workspace. No clients, tasks, financial records, forms, WhatsApp integrations or commercial records are copied. Core business tables use organization membership policies; account-owned tables use user policies. The first login creates the user's own profile and displays the initial tour. Skipping/finishing saves only that user's onboarding flag.

On identity changes the app cancels and clears query caches and remounts the authenticated layout. Temporary Meta onboarding drafts are scoped by user; legacy unscoped drafts and the previous user's draft are cleared. This cleanup affects temporary browser drafts only, never saved database records.

## Verification

- `node tests/signup-tenants-db.mjs`: isolated PGlite fixture matching the production organization/bootstrap policies. Verifies empty new organizations, rejected forged membership/metadata, owner access and unchanged pre-existing records.
- `node tests/signup-browser.mjs`: Playwright with intercepted Auth APIs and actual fixture RLS. Exercises signup validation, confirmation callback, first-login tour, first task, existing login, account switches, cache/draft isolation, no Google/purchase requests and a 320px signup layout.
- Browser tests create synthetic local users and never send confirmation emails or write to production. They validate the confirmation UI/callback, not external mailbox delivery.
