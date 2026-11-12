# Commercial intake from forms

This supersedes the WhatsApp-to-commercial automation described in older workflow documents. Conversations and messaging remain independent, with existing history and connected-number isolation preserved.

Only form submissions automatically enter the commercial CRM. Each form can select a commercial pipeline and the field used as the card name. New submissions enter its first stage; existing responses are imported once. Existing CRM cards remain available through “Mostrar cards anteriores (WhatsApp e manuais)”, and are excluded from the default board and form dashboard. No existing card is deleted or moved.

The dashboard counts submissions and their review status, with form, pipeline and date filters. Stage counts follow form cards. Moving a card marks its response analyzed; explicit review/unreview is available in card details and the form response list. A deleted card leaves its original response intact, so submission totals can exceed visible card totals. Existing pipeline names and stages are preserved.

Deletion actions are inside ellipsis menus and retain confirmation. Form, response and card deletion remain separate actions. Realtime updates have a visible-page polling fallback.

Verification: `npm test`, `npm run test:db`, `npm run test:browser`, TypeScript and production build. New database tests cover legacy preservation, service-role public intake, idempotency, review, tenant isolation and independent deletion. Browser tests cover public form → CRM → dashboard, automatic refresh and mobile menu targets without WhatsApp requests.
