// Lista (e seleciona) contas de anúncio para a conexão Meta PENDENTE do usuário (durante o onboarding).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { select_account_id } = body || {};

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pending } = await admin
      .from('meta_pending_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!pending) {
      return new Response(JSON.stringify({ error: 'no_pending' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (select_account_id) {
      const detRes = await fetch(`https://graph.facebook.com/v21.0/${select_account_id}?fields=name,account_id,currency&access_token=${pending.access_token}`);
      const det = await detRes.json();
      if (!detRes.ok) throw new Error(`Meta: ${JSON.stringify(det)}`);
      await admin.from('meta_pending_connections').update({
        selected_ad_account_id: select_account_id,
        selected_ad_account_name: det.name || null,
      }).eq('user_id', userId);
      return new Response(JSON.stringify({ ok: true, selected: { id: select_account_id, name: det.name } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fields = 'id,account_id,name,currency,account_status,business_name,business{id,name}';
    const listRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=${fields}&limit=200&access_token=${pending.access_token}`);
    const list = await listRes.json();
    if (!listRes.ok) throw new Error(`Meta: ${JSON.stringify(list)}`);

    const accounts = (list.data || []).map((a: any) => ({
      id: a.id,
      account_id: a.account_id,
      name: a.name || a.business_name || a.business?.name || (a.account_id ? `Conta ${a.account_id}` : a.id),
      currency: a.currency,
      account_status: a.account_status,
    }));

    return new Response(JSON.stringify({
      accounts,
      selected_ad_account_id: pending.selected_ad_account_id,
      selected_ad_account_name: pending.selected_ad_account_name,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('meta-pending-ad-accounts error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
