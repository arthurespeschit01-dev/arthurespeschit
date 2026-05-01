// Proxy para busca de targeting da Meta:
//   - type=geo: search geolocations (cities, regions, countries)
//   - type=interests: search interests / behaviors
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

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

    const { client_id, type, q, locale = 'pt_BR' } = await req.json().catch(() => ({} as any));
    if (!client_id || !type || !q) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }

    let url = '';
    if (type === 'geo') {
      const params = new URLSearchParams({
        location_types: JSON.stringify(['city', 'region', 'country', 'zip', 'neighborhood']),
        type: 'adgeolocation',
        q,
        limit: '20',
        locale,
        access_token: conn.access_token,
      });
      url = `${GRAPH}/search?${params.toString()}`;
    } else if (type === 'interests') {
      const params = new URLSearchParams({
        type: 'adinterest',
        q,
        limit: '25',
        locale,
        access_token: conn.access_token,
      });
      url = `${GRAPH}/search?${params.toString()}`;
    } else {
      return new Response(JSON.stringify({ error: 'invalid_type' }), { status: 400, headers: corsHeaders });
    }

    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: j?.error?.message || 'meta_error', meta: j }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ data: j.data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
