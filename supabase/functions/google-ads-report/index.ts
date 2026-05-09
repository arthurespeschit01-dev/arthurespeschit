// Relatório customizável do Google Ads — métricas selecionáveis, range de datas,
// filtros e timeseries diária. Espelha o que o gerenciador do Google oferece.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken } from "../_shared/google-ads.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ----- Catálogo de métricas suportadas (chaves usadas no front) -----
// Mantemos um whitelist para evitar GAQL injection.
const METRIC_FIELDS: Record<string, string> = {
  impressions: 'metrics.impressions',
  clicks: 'metrics.clicks',
  ctr: 'metrics.ctr',
  average_cpc: 'metrics.average_cpc',
  cost: 'metrics.cost_micros',
  conversions: 'metrics.conversions',
  conversions_value: 'metrics.conversions_value',
  all_conversions: 'metrics.all_conversions',
  video_views: 'metrics.video_views',
  average_cpv: 'metrics.average_cpv',
  engagements: 'metrics.engagements',
  interactions: 'metrics.interactions',
  search_impression_share: 'metrics.search_impression_share',
  search_top_impression_share: 'metrics.search_top_impression_share',
  absolute_top_impression_percentage: 'metrics.absolute_top_impression_percentage',
};

// Métricas sempre presentes (para cálculos derivados como CPA / ROAS no front).
const ALWAYS_FETCH = ['cost', 'clicks', 'impressions', 'conversions', 'conversions_value'];

function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function normalizeRow(r: any) {
  const m = r.metrics || {};
  const cost = (Number(m.costMicros || 0)) / 1_000_000;
  const conv = Number(m.conversions || 0);
  const convValue = Number(m.conversionsValue || 0);
  return {
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    ctr: Number(m.ctr || 0) * 100,
    average_cpc: Number(m.averageCpc || 0) / 1_000_000,
    cost,
    conversions: conv,
    conversions_value: convValue,
    all_conversions: Number(m.allConversions || 0),
    video_views: Number(m.videoViews || 0),
    average_cpv: Number(m.averageCpv || 0) / 1_000_000,
    engagements: Number(m.engagements || 0),
    interactions: Number(m.interactions || 0),
    search_impression_share: Number(m.searchImpressionShare || 0) * 100,
    search_top_impression_share: Number(m.searchTopImpressionShare || 0) * 100,
    absolute_top_impression_percentage: Number(m.absoluteTopImpressionPercentage || 0) * 100,
    cpa: conv > 0 ? cost / conv : 0,
    roas: cost > 0 ? convValue / cost : 0,
  };
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

    const body = await req.json().catch(() => ({}));
    const {
      client_id,
      start_date,
      end_date,
      metrics: requested = [],
      group_by = 'campaign', // 'campaign' | 'ad_group'
      campaign_ids = [],
      include_timeseries = true,
    } = body || {};

    if (!client_id) return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });

    // Default range: últimos 30 dias
    const today = new Date();
    const start = start_date || fmtDate(new Date(today.getTime() - 29 * 86400000));
    const end = end_date || fmtDate(today);

    // Sanitiza datas (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return new Response(JSON.stringify({ error: 'invalid dates' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('google_ads_connections').select('*').eq('client_id', client_id).maybeSingle();
    if (!conn || !(conn as any).selected_customer_id) {
      return new Response(JSON.stringify({ error: 'Conta Google Ads não selecionada' }), { status: 400, headers: corsHeaders });
    }

    const accessToken = await getValidAccessToken(admin, conn as any);
    const customerId = (conn as any).selected_customer_id;
    const loginCid = (conn as any).login_customer_id;

    // Whitelist das métricas
    const metricKeys = Array.from(new Set([...ALWAYS_FETCH, ...requested.filter((k: string) => METRIC_FIELDS[k])]));
    const metricFields = metricKeys.map(k => METRIC_FIELDS[k]).join(', ');

    const fromTable = group_by === 'ad_group' ? 'ad_group' : 'campaign';
    const idField = fromTable === 'ad_group' ? 'ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name' : 'campaign.id, campaign.name, campaign.status';

    // Filtro de campanhas (se houver)
    const safeCampaignIds = (Array.isArray(campaign_ids) ? campaign_ids : [])
      .map((s: any) => String(s).replace(/[^0-9]/g, '')).filter(Boolean);
    const campaignFilter = safeCampaignIds.length > 0
      ? ` AND campaign.id IN (${safeCampaignIds.join(',')})`
      : '';

    const baseWhere = `WHERE segments.date BETWEEN '${start}' AND '${end}'${campaignFilter}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json',
    };
    if (loginCid) headers['login-customer-id'] = loginCid;

    async function runGAQL(query: string) {
      const r = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
        method: 'POST', headers, body: JSON.stringify({ query, pageSize: 10000 }),
      });
      const j = await r.json();
      if (!r.ok) throw { status: r.status, body: j };
      return j.results || [];
    }

    // 1) Linhas agregadas por entidade
    const queryRows = `
      SELECT ${idField}, ${metricFields}
      FROM ${fromTable}
      ${baseWhere}
      ORDER BY metrics.cost_micros DESC
    `;

    let rawRows: any[] = [];
    try {
      rawRows = await runGAQL(queryRows);
    } catch (err: any) {
      const status = err.status === 401 || err.body?.error?.status === 'UNAUTHENTICATED' ? 401 : 400;
      return new Response(JSON.stringify({ error: 'google_api_error', detail: err.body, token_expired: status === 401 }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rows = rawRows.map((r: any) => {
      const norm = normalizeRow(r);
      if (group_by === 'ad_group') {
        return {
          id: r.adGroup?.id,
          name: r.adGroup?.name,
          status: r.adGroup?.status,
          campaign_id: r.campaign?.id,
          campaign_name: r.campaign?.name,
          ...norm,
        };
      }
      return {
        id: r.campaign?.id,
        name: r.campaign?.name,
        status: r.campaign?.status,
        ...norm,
      };
    });

    // 2) Timeseries diária (somente totais, para o gráfico)
    let timeseries: any[] = [];
    if (include_timeseries) {
      const queryTS = `
        SELECT segments.date, ${metricFields}
        FROM ${fromTable}
        ${baseWhere}
        ORDER BY segments.date
      `;
      try {
        const tsRows = await runGAQL(queryTS);
        // agregar por data
        const byDate = new Map<string, any>();
        for (const r of tsRows) {
          const date = r.segments?.date;
          if (!date) continue;
          const norm = normalizeRow(r);
          const cur = byDate.get(date) || {
            date, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0,
            video_views: 0, engagements: 0, interactions: 0, all_conversions: 0,
          };
          cur.impressions += norm.impressions;
          cur.clicks += norm.clicks;
          cur.cost += norm.cost;
          cur.conversions += norm.conversions;
          cur.conversions_value += norm.conversions_value;
          cur.video_views += norm.video_views;
          cur.engagements += norm.engagements;
          cur.interactions += norm.interactions;
          cur.all_conversions += norm.all_conversions;
          byDate.set(date, cur);
        }
        timeseries = Array.from(byDate.values()).map(d => ({
          ...d,
          ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
          average_cpc: d.clicks > 0 ? d.cost / d.clicks : 0,
          cpa: d.conversions > 0 ? d.cost / d.conversions : 0,
          roas: d.cost > 0 ? d.conversions_value / d.cost : 0,
        })).sort((a, b) => a.date.localeCompare(b.date));
      } catch (e) {
        console.warn('[google-ads-report] timeseries failed', e);
      }
    }

    return new Response(JSON.stringify({ rows, timeseries, period: { start, end } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('google-ads-report error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
