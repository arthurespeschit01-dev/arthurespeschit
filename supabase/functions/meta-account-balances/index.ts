// Lista saldos (balance + spend_cap) de TODAS as contas de anúncio conectadas
// para o usuário autenticado, atravessando todas as meta_connections dele.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

// Meta retorna balance/spend_cap em "centavos" da moeda (string).
// Convertemos para número decimal.
function toMoney(v: any): number {
  const n = parseFloat(String(v ?? '0')) || 0;
  return n / 100;
}

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pega todas as conexões com conta selecionada do usuário
    const { data: conns } = await admin.from('meta_connections')
      .select('id, client_id, access_token, selected_ad_account_id, selected_ad_account_name')
      .eq('user_id', userId);

    const connections = (conns || []).filter(c => !!c.selected_ad_account_id);

    // Mapeia client_id -> nome do cliente
    const clientIds = [...new Set(connections.map(c => c.client_id))];
    const { data: clientsData } = await admin.from('clients')
      .select('id, name').in('id', clientIds);
    const clientName = new Map((clientsData || []).map((c: any) => [c.id, c.name]));

    const results = await Promise.all(connections.map(async (c) => {
      try {
        const url = `${GRAPH}/${c.selected_ad_account_id}?fields=name,balance,currency,account_status&access_token=${c.access_token}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          return {
            client_id: c.client_id,
            client_name: clientName.get(c.client_id) || '—',
            account_id: c.selected_ad_account_id,
            account_name: c.selected_ad_account_name,
            error: j?.error?.message || 'Falha ao consultar conta',
          };
        }
        const balance = toMoney(j.balance);
        return {
          client_id: c.client_id,
          client_name: clientName.get(c.client_id) || '—',
          account_id: c.selected_ad_account_id,
          account_name: j.name || c.selected_ad_account_name,
          currency: j.currency || 'BRL',
          balance,
          account_status: j.account_status,
        };
      } catch (e) {
        return {
          client_id: c.client_id,
          client_name: clientName.get(c.client_id) || '—',
          account_id: c.selected_ad_account_id,
          account_name: c.selected_ad_account_name,
          error: String(e),
        };
      }
    }));

    return new Response(JSON.stringify({ accounts: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
