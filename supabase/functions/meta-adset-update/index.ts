// Atualiza configurações do adset (targeting, budgets, schedule, advantage audience).
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

    const body = await req.json().catch(() => ({} as any));
    const { client_id, meta_adset_id, targeting, daily_budget, lifetime_budget, name, status } = body;

    if (!client_id || !meta_adset_id) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }

    const params = new URLSearchParams();
    params.set('access_token', conn.access_token);
    if (targeting) params.set('targeting', JSON.stringify(targeting));
    if (typeof daily_budget === 'number' && daily_budget > 0) params.set('daily_budget', String(Math.round(daily_budget * 100)));
    if (typeof lifetime_budget === 'number' && lifetime_budget > 0) params.set('lifetime_budget', String(Math.round(lifetime_budget * 100)));
    if (name) params.set('name', name);
    if (status) params.set('status', status);

    const r = await fetch(`${GRAPH}/${meta_adset_id}`, { method: 'POST', body: params });
    const j = await r.json();
    if (!r.ok || j?.success === false) {
      return new Response(JSON.stringify({ error: j?.error?.message || 'meta_error', meta: j }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sincroniza dados básicos no banco
    const updates: any = {};
    if (name) updates.name = name;
    if (status) updates.status = status;
    if (typeof daily_budget === 'number') updates.daily_budget = daily_budget;
    if (typeof lifetime_budget === 'number') updates.lifetime_budget = lifetime_budget;
    if (Object.keys(updates).length) {
      await admin.from('ad_sets').update(updates)
        .eq('meta_adset_id', meta_adset_id).eq('user_id', userId);
    }

    return new Response(JSON.stringify({ ok: true, meta: j }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
