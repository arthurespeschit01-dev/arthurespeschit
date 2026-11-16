# Advertising tracking setup

The pilot's Meta Ads screen presents only Pixel ID, optional Page ID, optional test event code and access token, plus the conversion enable/save controls. Sending conversions requires the pixel and token. Webhook app secrets, verification tokens, callback URLs, lead-form setup and daily limits are not customer setup fields. Previously saved settings and server-side limits are retained. Meta lead-form delivery remains a separate backend capability, not a prerequisite for sending conversions.

The Google Ads screen uses scheduled HTTPS/CSV import, with its workspace URL, import instructions, download/rotation and query statistics. It does not render direct API or OAuth credential fields. No OAuth app is required for this Google Ads import flow. Google Calendar is a separate integration and retains its own authorization flow.

If a workspace already has direct API delivery enabled, the user can choose “Usar importação por URL”. The client first disables that provider through the existing authenticated endpoint with an empty credential patch, preserving saved credentials, then enables the feed. Failure stops the sequence; existing server/database mutual-exclusion checks remain authoritative. A failed switch can leave the old delivery disabled and is shown as an error for retry; it never silently resumes unwanted API delivery or bypasses duplicate protection. No switch occurs on page load.

A feed fetch or download is not evidence that Google accepted conversions. The user must create the matching click-conversion action, enable auto-tagging, preserve gclid attribution and schedule the HTTPS import in Google Ads.

Stored credentials, secret redaction/merge semantics, permissions, conversion rules, tracked links and credit/usage screens are preserved. Validation uses synthetic provider settings and does not deliver live conversions or write production integration settings.
