// Lista fundos disponíveis de TODAS as contas de anúncio conectadas
// para o usuário autenticado, atravessando todas as meta_connections dele.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

// Meta retorna valores monetários em "centavos" da moeda (string).
// Convertemos para número decimal.
function toMoney(v: any): number {
  const n = parseFloat(String(v ?? '0')) || 0;
  return n / 100;
}

function getAvailableFunds(account: any): number {
  const billBalance = toMoney(account.balance);
  const spendCap = toMoney(account.spend_cap);
  const amountSpent = toMoney(account.amount_spent);
  const remainingCap = spendCap > 0 ? Math.max(spendCap - amountSpent, 0) : 0;
  return Number((spendCap > 0 ? remainingCap : billBalance).toFixed(2));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const debug = body?.debug === true;
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
        const adAccountId = String(c.selected_ad_account_id).startsWith('act_')
          ? c.selected_ad_account_id
          : `act_${c.selected_ad_account_id}`;
        const fields = debug
          ? 'name,currency,balance,spend_cap,amount_spent,funding_source,funding_source_details,is_prepay_account'
          : 'name,currency,balance,spend_cap,amount_spent';
        const url = `${GRAPH}/${adAccountId}?fields=${fields}&access_token=${c.access_token}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) {
          return {
            client_id: c.client_id,
            client_name: clientName.get(c.client_id) || '—',
            account_id: adAccountId,
            account_name: c.selected_ad_account_name,
            error: j?.error?.message || 'Falha ao consultar conta',
          };
        }
        const balance = getAvailableFunds(j);
        return {
          client_id: c.client_id,
          client_name: clientName.get(c.client_id) || '—',
          account_id: adAccountId,
          account_name: j.name || c.selected_ad_account_name,
          currency: j.currency || 'BRL',
          balance,
          ...(debug ? {
            debug: {
              raw_balance: j.balance,
              raw_spend_cap: j.spend_cap,
              raw_amount_spent: j.amount_spent,
              funding_source: j.funding_source,
              funding_source_details: j.funding_source_details,
              is_prepay_account: j.is_prepay_account,
            },
          } : {}),
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
