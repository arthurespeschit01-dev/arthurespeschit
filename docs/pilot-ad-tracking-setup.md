# Advertising tracking setup

The pilot's Meta Ads screen presents Pixel ID, optional Page ID, optional test event code and access token. Sending conversions requires the pixel and token. The Page ID still supports the separate Meta lead-form integration; it is not a WhatsApp account identifier. App secret, webhook verification token, callback and lead-form destination are in a closed advanced section. Daily conversion limits are separate from the basic connection.

The Google Ads screen presents scheduled HTTPS/CSV import first, with its scoped URL, import instructions, download/rotation and query statistics. Direct Data Manager API credentials remain in a closed advanced section. An active API connection is identified in the summary, and must be disabled before enabling CSV. Existing server/database mutual-exclusion checks remain authoritative. A feed fetch or download is not evidence that Google accepted conversions.

This changes only the pilot setup presentation. Stored credentials, secret redaction/merge semantics, permissions, conversion rules, tracked links, credit/usage screens and delivery mechanisms are unchanged. No real provider requests or production configuration writes are part of validation.
