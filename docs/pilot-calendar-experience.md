# Workspace calendar experience

Commercial scheduling offers month/week calendar views and the existing list, using the same workspace-scoped appointment rows. Period navigation, today, local device time and selection reveal the existing appointment/status controls. Cancelled records remain visible with a strike-through. Calendar rendering never writes to Google or imports unrelated Google events.

Google synchronization remains server-side through the scoped minute worker: local appointments create deterministic provider event IDs, edits update the same event, and cancelled appointments remove that event. OAuth credentials and callback instructions are not shown in the client integration screen. Missing server configuration directs the user to their account administrator.

The Google authorization warning is controlled by Google, not by this UI. The project owner must configure the consent screen's public application name, support contact, domain and privacy policy, then submit the Calendar scopes for Google's verification as applicable. Enabling production alone does not verify sensitive scopes. An external application in testing is limited to test users and Calendar offline authorizations can expire after seven days. Do not promise customers permanent connectivity until the Google publishing/verification requirements are complete.

Validation uses synthetic workspace appointments and mocked Google endpoints, including create/update/cancel and free-busy failure behavior. It sends no real invitations or provider events.
