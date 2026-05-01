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

function parseDisplayMoney(v: any): number | null {
  const text = String(v ?? '');
  const match = text.match(/(?:R\$|\$|€|£)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:\.\d{2})?)/);
  if (!match) return null;
  const normalized = match[1].includes(',')
    ? match[1].replace(/\./g, '').replace(',', '.')
    : match[1];
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Apenas contas PRÉ-PAGAS (funding type 20 — "Saldo disponível") possuem saldo
 * real disponível. Em contas pós-pagas (cartão de crédito, débito automático,
 * boleto, etc.) o campo `balance` da Meta representa **dívida pendente** (gasto
 * já realizado e ainda não cobrado no método de pagamento), NÃO crédito.
 *
 * Retornar essa dívida como "saldo" engana o usuário — por isso, para contas
 * pós-pagas, devolvemos `available_balance = null` e expomos `pending_bill`
 * como info secundária.
 */
function computeBalance(account: any): {
  available_balance: number | null;
  pending_bill: number;
  is_prepaid: boolean;
  funding_type: number | null;
  funding_label: string;
} {
  const fundingType = account.funding_source_details?.type ?? null;
  const isPrepaid = fundingType === 20;
  const pendingBill = toMoney(account.balance);
  const fundingLabel = String(account.funding_source_details?.display_string || '').trim();

  if (isPrepaid) {
    const displayed = parseDisplayMoney(fundingLabel);
    const value = displayed !== null ? displayed : pendingBill;
    return {
      available_balance: Number(value.toFixed(2)),
      pending_bill: 0,
      is_prepaid: true,
      funding_type: fundingType,
      funding_label: 'Saldo pré-pago',
    };
  }

  // Pós-pago: NÃO existe "saldo disponível" — só fatura em aberto
  return {
    available_balance: null,
    pending_bill: Number(pendingBill.toFixed(2)),
    is_prepaid: false,
    funding_type: fundingType,
    funding_label: fundingLabel || 'Cartão de crédito',
  };
}

/**
 * account_status da Meta:
 *   1 = ATIVA
 *   2 = DESABILITADA
 *   3 = UNSETTLED (fatura não paga)
 *   7 = PENDING_RISK_REVIEW
 *   8 = PENDING_SETTLEMENT
 *   9 = IN_GRACE_PERIOD
 *   100 = PENDING_CLOSURE
 *   101 = CLOSED
 *   102 = ANY_ACTIVE
 *   201 = ANY_CLOSED
 */
function statusProblem(status: number): string | null {
  switch (status) {
    case 2: return 'Conta desabilitada';
    case 3: return 'Fatura em atraso';
    case 7: return 'Em revisão de risco';
    case 8: return 'Aguardando pagamento';
    case 9: return 'Em período de carência';
    case 100: return 'Encerramento pendente';
    case 101: return 'Conta encerrada';
    default: return null;
  }
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
        const adAccountId = String(c.selected_ad_account_id).startsWith('act_')
          ? c.selected_ad_account_id
          : `act_${c.selected_ad_account_id}`;
        const url = `${GRAPH}/${adAccountId}?fields=name,currency,balance,spend_cap,amount_spent,funding_source_details,account_status,business&access_token=${c.access_token}`;
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
        const bal = computeBalance(j);
        const accountStatus = Number(j.account_status ?? 1);
        const statusErr = statusProblem(accountStatus);
        return {
          client_id: c.client_id,
          client_name: clientName.get(c.client_id) || '—',
          account_id: adAccountId,
          account_name: j.name || c.selected_ad_account_name,
          currency: j.currency || 'BRL',
          available_balance: bal.available_balance,
          pending_bill: bal.pending_bill,
          is_prepaid: bal.is_prepaid,
          funding_type: bal.funding_type,
          funding_label: bal.funding_label,
          account_status: accountStatus,
          balance: bal.available_balance ?? 0,
          business_id: j.business?.id || null,
          ...(statusErr ? { account_status_label: statusErr } : {}),
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
