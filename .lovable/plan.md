# Google Ads Integration Plan

Mirror the Meta Ads integration end-to-end so each client can connect a Google Ads account, view metrics/campaigns, and export a PDF report.

## Important clarifications before building

A few points in the spec need correction before I implement — Google Ads has hard requirements that differ from Meta:

1. **Cannot reuse the user's Google Sign-In token.** Lovable Cloud's managed Google OAuth (`/auth/v1/callback`) does not expose a refresh token to the app, and the `adwords` scope must go through Google's own OAuth consent flow. The integration needs its **own OAuth client** in Google Cloud Console, separate from the Sign-In one.
2. **Developer Token approval.** The Google Ads API requires a Developer Token (Basic or Standard access) tied to a Manager (MCC) account. Without it, calls return `DEVELOPER_TOKEN_NOT_APPROVED`. The user must obtain this from Google before the integration works in production.
3. **`metrics.roas` does not exist** in GAQL. ROAS will be computed as `conversions_value / cost`. Spec adjusted.
4. **Schema target.** There is no `client_connections` table — the existing pattern uses one table per provider (`meta_connections`). I'll mirror that with `google_ads_connections`.

## What gets built

### 1. Database
New table `google_ads_connections` (mirrors `meta_connections`):
- access_token, refresh_token, token_expires_at
- selected_customer_id, selected_customer_name, login_customer_id (for MCC)
- client_id, user_id, timestamps
- RLS: `auth.uid() = user_id`

New table `google_ads_oauth_states` (mirrors `meta_oauth_states`) for CSRF state.

### 2. Edge functions (new)
- `google-ads-auth` — builds the Google OAuth URL with `scope=https://www.googleapis.com/auth/adwords` + `access_type=offline&prompt=consent` and stores the state.
- `google-ads-auth-callback` — exchanges code for access+refresh tokens, persists to `google_ads_connections`.
- `google-ads-list-customers` — calls `customers:listAccessibleCustomers` so the user can pick which Google Ads account to use for the client.
- `google-ads-set-customer` — saves the selected customer_id (and login_customer_id when behind an MCC).
- `google-ads-campaign-insights` — runs GAQL via `customers/{id}/googleAds:searchStream` for the selected date range, returns campaign-level metrics (impressions, clicks, ctr, average_cpc, cost, conversions, conversions_value, computed ROAS).
- `google-ads-disconnect` — clears tokens and any cached campaign data.

All functions follow the existing Meta pattern: validate JWT in code, use service role for writes, return `token_expired` (401) when Google returns `UNAUTHENTICATED` so the UI can prompt reconnect.

### 3. Secrets to add (you'll need to provide these)
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REDIRECT_URI` — must equal the deployed `google-ads-auth-callback` URL and be added as an Authorized redirect URI in your Google Cloud OAuth client

### 4. Frontend
- New `src/components/GoogleAdsTab.tsx` — same dark/roxo visual language as `MetaAdsTab`:
  - "Conectar Google Ads" CTA + status badge when disconnected
  - Customer picker after OAuth
  - Period selector (7/14/30 dias, custom range — same `DateRangePicker` already used)
  - Metric cards: Impressões, Cliques, CTR, CPC médio, Custo, Conversões, Valor de conversão, ROAS
  - Campaigns table (name, status, custo, cliques, conversões, ROAS)
  - Evolution chart reusing the existing chart wrapper
  - "Gerar relatório PDF" button
- Wire the new tab into `ClientDetail.tsx` next to the Meta Ads tab.

### 5. PDF report
Extend `src/lib/exportCampaignsPDF.ts` (or create `exportGoogleAdsPDF.ts` following the same pattern) with a Google Ads section: same card grid + table layout, Google Ads logo in the header.

### 6. What I will NOT touch
- Meta Ads tab and its functions
- Auth flow for app sign-in
- Any other page

## Technical notes

```text
OAuth flow
──────────
User clicks "Conectar Google Ads" in GoogleAdsTab
  → invoke google-ads-auth { client_id }
  → returns Google consent URL → window.location
  → Google redirects to google-ads-auth-callback
  → exchange code → store tokens → redirect back to /clientes/:id?google_ads=connected
  → tab loads list of customers → user picks one → google-ads-set-customer
  → metrics load via google-ads-campaign-insights
```

```text
Token refresh
─────────────
Each insights call:
  if access_token expired (token_expires_at < now()+60s):
    POST https://oauth2.googleapis.com/token
      grant_type=refresh_token, refresh_token, client_id, client_secret
    persist new access_token + expires_at
```

GAQL used for campaign insights:
```
SELECT campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.ctr,
       metrics.average_cpc, metrics.cost_micros,
       metrics.conversions, metrics.conversions_value
FROM campaign
WHERE segments.date BETWEEN '{since}' AND '{until}'
```
ROAS computed client-side: `conversions_value / (cost_micros / 1e6)`.

## Order of work after approval
1. Migration: create `google_ads_connections` + `google_ads_oauth_states` with RLS
2. Request the 4 secrets from you
3. Build the 6 edge functions
4. Build `GoogleAdsTab.tsx` and wire into `ClientDetail.tsx`
5. Add Google Ads section to PDF export
6. Smoke-test the OAuth round trip with `curl_edge_functions`