// Helpers compartilhados para Google Ads (refresh de token).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GOOGLE_ADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID')!;
const GOOGLE_ADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!;

export interface GoogleAdsConnection {
  id: string;
  user_id: string;
  client_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  selected_customer_id: string | null;
  selected_customer_name: string | null;
  login_customer_id: string | null;
}

export async function getValidAccessToken(admin: SupabaseClient, conn: GoogleAdsConnection): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  // Renova se faltar menos de 60s
  if (conn.access_token && expiresAt - Date.now() > 60_000) {
    return conn.access_token;
  }
  if (!conn.refresh_token) throw new Error('Sem refresh_token — reconecte o Google Ads');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Refresh token: ${JSON.stringify(data)}`);

  const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('google_ads_connections')
    .update({ access_token: data.access_token, token_expires_at: newExpires })
    .eq('id', conn.id);
  return data.access_token;
}
