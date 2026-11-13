# Commercial workspace release operations

The feature branch contains the complete tested source. Do not promote the frontend before the database migrations are installed. The live agency interface must continue working throughout the release.

## Release sequence

1. Apply `20261113215540_workspace_commercial_modules.sql`, then `20261113220957_workspace_integrations.sql` to the Central production database through the approved migration interface. These add workspace-owned modules and replace only pilot access helpers; they do not migrate or delete agency business data.
2. Deploy `workspace-operations` with the entrypoint and every relative dependency in `supabase/functions/_shared`. JWT verification at the gateway is disabled because public capture links and provider webhooks authenticate within the handler; management actions verify the user's JWT and current workspace permissions. No admin Auth provisioning endpoint is present.
3. Apply `20261113222542_workspace_automation_scheduler.sql`. This creates separate workspace automation, outbox and Google jobs. Preserve all legacy agency/Vértice jobs.
4. Verify workspace modules, exactly the intended private pilot enrollment, original agency row counts, service-only credential access and all three new cron job definitions.
5. Promote the reviewed frontend commit using the existing Vercel Git connection and correct production environment. The old local environment is not a production build source.
6. Read-only pilot smoke test: real login, company selector, module navigation, seeded form/calendar/internal funnel, team UI and mobile. Do not create fake production responses or send test WhatsApp messages.

The migration connector returned an expired-confirmation error before executing the release, although plugin permissions were already set to allow all actions. Do not route the same unconfirmed DDL through a different automated SQL interface. If the owner elects to perform the release manually, provide the exact reviewed transactional SQL bundle and verify the result before promoting the frontend. The bundle records the three corresponding migration versions after success.

Google requires its OAuth environment credentials and the `workspace-operations?google_callback=1` redirect URI authorized by the Google project owner. W-API requires a company-exclusive instance and confirmed received/delivery callback settings. No new credentials should be written to Git or copied from the legacy agency connection.
