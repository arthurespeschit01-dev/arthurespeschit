// Lista as contas (customers) acessíveis com o token do usuário OU seleciona uma.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken } from "../_shared/google-ads.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!;
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
    if (!userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const { client_id, select_customer_id, login_customer_id } = body;
    if (!client_id) return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('google_ads_connections').select('*').eq('client_id', client_id).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: 'Sem conexão' }), { status: 404, headers: corsHeaders });

    const accessToken = await getValidAccessToken(admin, conn as any);

    // Se for para selecionar uma conta
    if (select_customer_id) {
      // Buscar nome do customer
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      };
      if (login_customer_id) headers['login-customer-id'] = login_customer_id.replace(/-/g, '');

      let customerName = select_customer_id;
      try {
        const nameRes = await fetch(`https://googleads.googleapis.com/v17/customers/${select_customer_id.replace(/-/g, '')}/googleAds:search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'SELECT customer.descriptive_name FROM customer LIMIT 1' }),
        });
        const nameData = await nameRes.json();
        customerName = nameData?.results?.[0]?.customer?.descriptiveName || select_customer_id;
      } catch (_) { /* ignore */ }

      await admin.from('google_ads_connections').update({
        selected_customer_id: select_customer_id.replace(/-/g, ''),
        selected_customer_name: customerName,
        login_customer_id: login_customer_id ? login_customer_id.replace(/-/g, '') : null,
      }).eq('id', (conn as any).id);

      return new Response(JSON.stringify({ ok: true, name: customerName }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Listar contas acessíveis
    const listRes = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      },
    });
    const listData = await listRes.json();
    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: `Google Ads: ${JSON.stringify(listData)}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // resourceNames: ["customers/1234567890", ...]
    const customers = (listData.resourceNames || []).map((rn: string) => {
      const id = rn.replace('customers/', '');
      const formatted = id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
      return { id, formatted };
    });

    return new Response(JSON.stringify({ customers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('google-ads-list-customers error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
