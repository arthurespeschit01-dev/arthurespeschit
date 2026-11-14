# Agency design pilot

The sober visual language is enabled only for the authenticated owner returned by `agency_workspace_identity().pilot_owner`. The private enrollment currently identifies the requested pilot account. Names, emails, user IDs and editable user metadata are never used as the frontend eligibility rule. Being invited to a pilot workspace does not enable the agency design.

`PilotVisualTheme` mounts inside the authenticated provider, sets `html[data-product-skin="pilot"]` after the server confirms eligibility, and removes it on identity errors, account changes, logout and unmount. User-specific query keys prevent cached eligibility from following a different account. Public form/customer portal pages are outside the authenticated theme boundary.

All new CSS is scoped to that HTML attribute. Light and dark palettes follow the existing theme preference/toggle. The approved revision uses soft corners, a light navigation surface in light mode and a charcoal navigation surface in dark mode. Shared headers have a consistent divider and spacing, client rows have a clear reading order, and each existing row of dashboard metrics forms one report surface with internal separators. Metric order, labels and calculations remain intact. Inputs, buttons, tables and task tabs share the same visual language. Changes cover shared color tokens, typography, surfaces, subtle borders, compact desktop controls, sidebar treatment and dashboard metric styling. Touch targets remain at least 44px on the mobile sidebar. The sidebar still supports collapsing and the current navigation groups.

No sections, routes, charts, dashboard calculations, task views, filters, queries, mutations, recurrence, data or access permissions are changed. The agency layout and dashboard receive only CSS hook classes; existing markup/order and controls remain intact. Other accounts use their original styles. CSS applies across the pilot owner's authenticated account, including its existing subaccount pages, rather than being limited to the laboratory routes.

Verification: `node tests/pilot-visual-browser.mjs` checks light/dark dashboard, tasks and clients, compares semantic page/control signatures with an ordinary account, exercises task modes/dialogs/mobile menu, verifies logout cleanup, and denies the skin to an invited member, an ordinary user with forged metadata, and an identity lookup failure. Fixtures intercept all external API calls and reject writes. Screenshots are local test artifacts, not user data. Production verification is read-only and closes any opened dialogs without saving.

Rollback removes `PilotVisualTheme` from the authenticated provider or removes the scoped stylesheet import. No database rollback is necessary.

The approved preview is captured from the actual application with synthetic fixtures via `VISUAL_PREVIEW=1 node tests/pilot-visual-browser.mjs`. This does not insert sample data into any account.
