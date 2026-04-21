// Lista contas de anúncio do token Meta de um cliente. Permite selecionar uma conta ativa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const body = await req.json().catch(() => ({}));
    const { client_id, select_account_id } = body;
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('*').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }

    // Se foi pedido para selecionar conta, atualiza
    if (select_account_id) {
      // buscar nome
      const detRes = await fetch(`https://graph.facebook.com/v21.0/${select_account_id}?fields=name,account_id,currency&access_token=${conn.access_token}`);
      const det = await detRes.json();
      if (!detRes.ok) throw new Error(`Meta: ${JSON.stringify(det)}`);
      await admin.from('meta_connections').update({
        selected_ad_account_id: select_account_id,
        selected_ad_account_name: det.name || null,
      }).eq('id', conn.id);
      return new Response(JSON.stringify({ ok: true, selected: { id: select_account_id, name: det.name } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Listar contas
    const listRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,currency,account_status&limit=100&access_token=${conn.access_token}`);
    const list = await listRes.json();
    if (!listRes.ok) throw new Error(`Meta: ${JSON.stringify(list)}`);

    return new Response(JSON.stringify({
      accounts: list.data || [],
      selected_ad_account_id: conn.selected_ad_account_id,
      selected_ad_account_name: conn.selected_ad_account_name,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
