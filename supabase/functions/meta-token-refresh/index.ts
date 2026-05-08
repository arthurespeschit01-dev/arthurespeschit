// Renova silenciosamente o token de longa duração da Meta (60 dias).
// Se faltar menos de `threshold_days` (padrão 7) para expirar, faz fb_exchange_token.
// Retorna { refreshed: bool, token_expires_at: string|null, days_left: number, status: 'ok'|'expiring'|'expired'|'no_connection' }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_ID = Deno.env.get('META_APP_ID')!;
const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { client_id, threshold_days = 7 } = await req.json().catch(() => ({} as any));
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('id, access_token, token_expires_at')
      .eq('client_id', client_id).eq('user_id', userId).maybeSingle();

    if (!conn?.access_token) {
      return new Response(JSON.stringify({ status: 'no_connection', refreshed: false, days_left: 0, token_expires_at: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    const expAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    const daysLeft = expAt ? (expAt - now) / 86400000 : 0;

    if (expAt && daysLeft <= 0) {
      return new Response(JSON.stringify({ status: 'expired', refreshed: false, days_left: 0, token_expires_at: conn.token_expires_at }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Renova se faltar menos que o threshold
    if (!expAt || daysLeft < threshold_days) {
      const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      url.searchParams.set('grant_type', 'fb_exchange_token');
      url.searchParams.set('client_id', META_APP_ID);
      url.searchParams.set('client_secret', META_APP_SECRET);
      url.searchParams.set('fb_exchange_token', conn.access_token);
      const r = await fetch(url.toString());
      const j = await r.json();
      if (!r.ok || !j.access_token) {
        // Não conseguiu renovar — token provavelmente revogado/expirado
        return new Response(JSON.stringify({
          status: daysLeft > 0 ? 'expiring' : 'expired',
          refreshed: false, days_left: Math.max(0, daysLeft),
          token_expires_at: conn.token_expires_at,
          error: j?.error?.message || 'refresh_failed',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const newExpiresIn = (j.expires_in as number) || 60 * 24 * 3600;
      const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();
      await admin.from('meta_connections').update({
        access_token: j.access_token,
        token_expires_at: newExpiresAt,
      }).eq('id', conn.id);
      return new Response(JSON.stringify({
        status: 'ok', refreshed: true,
        days_left: newExpiresIn / 86400,
        token_expires_at: newExpiresAt,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      status: 'ok', refreshed: false, days_left: daysLeft,
      token_expires_at: conn.token_expires_at,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
