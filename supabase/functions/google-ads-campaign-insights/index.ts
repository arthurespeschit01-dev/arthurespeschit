// Busca métricas de campanhas do Google Ads via GAQL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken } from "../_shared/google-ads.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
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
    if (!userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { client_id, days = 30 } = await req.json().catch(() => ({}));
    if (!client_id) return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('google_ads_connections').select('*').eq('client_id', client_id).maybeSingle();
    if (!conn || !(conn as any).selected_customer_id) {
      return new Response(JSON.stringify({ error: 'Conta não selecionada' }), { status: 400, headers: corsHeaders });
    }

    const accessToken = await getValidAccessToken(admin, conn as any);
    const { start, end } = dateRange(days);

    const query = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.ctr,
             metrics.average_cpc, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json',
    };
    const loginCid = (conn as any).login_customer_id;
    if (loginCid) headers['login-customer-id'] = loginCid;

    const customerId = (conn as any).selected_customer_id;
    const apiRes = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
      method: 'POST', headers, body: JSON.stringify({ query, pageSize: 1000 }),
    });
    const apiData = await apiRes.json();

    if (!apiRes.ok) {
      const status = apiRes.status === 401 || apiData?.error?.status === 'UNAUTHENTICATED' ? 401 : 400;
      return new Response(JSON.stringify({ error: 'google_api_error', detail: apiData, token_expired: status === 401 }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const campaigns = (apiData.results || []).map((r: any) => {
      const cost = (r.metrics?.costMicros || 0) / 1_000_000;
      const conversions = Number(r.metrics?.conversions || 0);
      const conversionsValue = Number(r.metrics?.conversionsValue || 0);
      return {
        id: r.campaign?.id,
        name: r.campaign?.name,
        status: r.campaign?.status,
        impressions: Number(r.metrics?.impressions || 0),
        clicks: Number(r.metrics?.clicks || 0),
        ctr: Number(r.metrics?.ctr || 0) * 100,
        average_cpc: (r.metrics?.averageCpc || 0) / 1_000_000,
        cost,
        conversions,
        conversions_value: conversionsValue,
        cpa: conversions > 0 ? cost / conversions : 0,
        roas: cost > 0 ? conversionsValue / cost : 0,
      };
    });

    return new Response(JSON.stringify({ campaigns, period: { start, end } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('google-ads-campaign-insights error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
