// Importa ad sets da Meta para uma campanha (ou todas as campanhas Meta da conta)
// + INSIGHTS por adset (gasto, leads, compras, mensagens, ROAS, CPA por objetivo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

const VALID_PRESETS = new Set([
  'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_week_mon_sun', 'last_week_mon_sun', 'this_month', 'last_month', 'maximum',
]);

function normalizePreset(p: string | undefined): string {
  if (!p) return 'maximum';
  if (p === 'this_week') return 'this_week_mon_sun';
  if (p === 'last_week') return 'last_week_mon_sun';
  return p;
}

async function fetchAllPages(url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = url;
  let safety = 0;
  while (next && safety < 20) {
    const r = await fetch(next);
    const j = await r.json();
    if (!r.ok) throw new Error(`Meta: ${JSON.stringify(j)}`);
    out.push(...(j.data || []));
    next = j.paging?.next || null;
    safety++;
  }
  return out;
}

function parseActions(ins: any) {
  // Parsing alinhado com as colunas oficiais do Gerenciador de Anúncios.
  let messages = 0, messagesFallback = 0;
  let postEng = 0, pageEng = 0;
  let leadStd = 0, leadGrouped = 0, leadPixel = 0;
  let purchaseStd = 0, purchaseOmni = 0, purchasePixel = 0, purchaseOnsite = 0;
  let link_clicks = 0;
  let followers = 0, profile_visits = 0;

  for (const a of (ins?.actions || [])) {
    const v = parseFloat(a.value || '0') || 0;
    const t = a.action_type;
    if (t === 'onsite_conversion.messaging_conversation_started_7d') messages = v;
    else if (t === 'onsite_conversion.messaging_conversation_started') messagesFallback = Math.max(messagesFallback, v);
    else if (t === 'onsite_conversion.total_messaging_connection') messagesFallback = Math.max(messagesFallback, v);
    if (t === 'post_engagement') postEng = v;
    if (t === 'page_engagement') pageEng = v;
    if (t === 'lead') leadStd = v;
    if (t === 'onsite_conversion.lead_grouped') leadGrouped = v;
    if (t === 'offsite_conversion.fb_pixel_lead') leadPixel = v;
    if (t === 'purchase') purchaseStd = v;
    if (t === 'omni_purchase') purchaseOmni = v;
    if (t === 'offsite_conversion.fb_pixel_purchase') purchasePixel = v;
    if (t === 'onsite_web_purchase') purchaseOnsite = v;
    if (t === 'link_click') link_clicks = v;
    if (t === 'follow' || t === 'onsite_conversion.follow' || t === 'page_likes') followers = Math.max(followers, v);
    if (t === 'onsite_conversion.profile_visit') profile_visits = Math.max(profile_visits, v);
  }
  if (messages === 0) messages = messagesFallback;
  const engagements = postEng > 0 ? postEng : pageEng;
  // Paridade com Ads Manager: prioridade entre variações da mesma conversão
  const leads = leadGrouped || leadStd || leadPixel;
  const purchases = purchaseOmni || purchaseStd || purchasePixel || purchaseOnsite;

  let revenueStd = 0, revenueOmni = 0, revenuePixel = 0, revenueOnsite = 0;
  for (const a of (ins?.action_values || [])) {
    const v = parseFloat(a.value || '0') || 0;
    if (a.action_type === 'purchase') revenueStd = v;
    if (a.action_type === 'omni_purchase') revenueOmni = v;
    if (a.action_type === 'offsite_conversion.fb_pixel_purchase') revenuePixel = v;
    if (a.action_type === 'onsite_web_purchase') revenueOnsite = v;
  }
  const revenue = revenueOmni || revenueStd || revenuePixel || revenueOnsite;

  return { leads, purchases, messages, link_clicks, revenue, engagements, followers, profile_visits };
}

function cpaForObjective(objective: string, spend: number, leads: number, purchases: number, messages: number) {
  const o = (objective || '').toUpperCase();
  if (o.includes('LEAD')) return leads > 0 ? spend / leads : 0;
  if (o.includes('SALES') || o.includes('CONVERSIONS') || o.includes('PURCHASE')) return purchases > 0 ? spend / purchases : 0;
  if (o.includes('MESSAGES') || o.includes('ENGAGEMENT')) return messages > 0 ? spend / messages : 0;
  // fallback: leads ou compras se houver
  if (leads > 0) return spend / leads;
  if (purchases > 0) return spend / purchases;
  return 0;
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

    const { client_id, campaign_id, date_preset, since, until } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('*').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    if (!conn.selected_ad_account_id) return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });

    const accessToken = conn.access_token;

    // Time param
    let timeParam = '';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
    } else {
      const norm = normalizePreset(date_preset);
      const preset = VALID_PRESETS.has(norm) ? norm : 'maximum';
      timeParam = `&date_preset=${preset}`;
    }

    // Determina campanhas alvo
    let campaignsQuery = admin.from('campaigns')
      .select('id, meta_campaign_id, objective')
      .eq('client_id', client_id)
      .eq('user_id', userId)
      .eq('source', 'meta')
      .not('meta_campaign_id', 'is', null);
    if (campaign_id) campaignsQuery = campaignsQuery.eq('id', campaign_id);
    const { data: campaigns } = await campaignsQuery;
    if (!campaigns?.length) return new Response(JSON.stringify({ imported: 0, total: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const statusMap: Record<string, string> = {
      ACTIVE: 'Ativo', PAUSED: 'Pausado', DELETED: 'Excluído', ARCHIVED: 'Arquivado',
    };

    const fields = 'id,name,status,daily_budget,lifetime_budget,bid_strategy,optimization_goal,start_time,end_time,campaign_id';
    const insightFields = 'adset_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
    const attribParam = `&use_unified_attribution_setting=true&action_attribution_windows=${encodeURIComponent('["7d_click","1d_view"]')}&action_report_time=mixed`;
    let imported = 0;

    for (const camp of campaigns) {
      const url = `${GRAPH}/${camp.meta_campaign_id}/adsets?fields=${fields}&limit=50&access_token=${accessToken}`;
      let adsets: any[] = [];
      try { adsets = await fetchAllPages(url); }
      catch (e) { console.warn(`adsets failed for campaign ${camp.meta_campaign_id}:`, String(e)); continue; }

      // Insights por adset
      const insightsMap = new Map<string, any>();
      try {
        const insUrl = `${GRAPH}/${camp.meta_campaign_id}/insights?level=adset&fields=${insightFields}${timeParam}&limit=200&access_token=${accessToken}`;
        const insights = await fetchAllPages(insUrl);
        for (const row of insights) insightsMap.set(row.adset_id, row);
      } catch (e) {
        console.warn(`adset insights failed for campaign ${camp.meta_campaign_id}:`, String(e));
      }

      for (const a of adsets) {
        const ins = insightsMap.get(a.id) || {};
        const spend = parseFloat(ins.spend || '0') || 0;
        const impressions = parseInt(ins.impressions || '0') || 0;
        const clicks = parseInt(ins.clicks || '0') || 0;
        const ctr = parseFloat(ins.ctr || '0') || 0;
        const cpc = parseFloat(ins.cpc || '0') || 0;
        const cpm = parseFloat(ins.cpm || '0') || 0;
        const reach = parseInt(ins.reach || '0') || 0;
        const frequency = parseFloat(ins.frequency || '0') || 0;
        const acts = parseActions(ins);
        const cpa = cpaForObjective(camp.objective || '', spend, acts.leads, acts.purchases, acts.messages);
        const roas = spend > 0 ? acts.revenue / spend : 0;

        const payload = {
          user_id: userId,
          campaign_id: camp.id,
          meta_adset_id: a.id,
          meta_campaign_id: camp.meta_campaign_id,
          name: a.name || 'Sem nome',
          status: statusMap[a.status] || a.status || 'Ativo',
          daily_budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : 0,
          lifetime_budget: a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : 0,
          bid_strategy: a.bid_strategy || '',
          optimization_goal: a.optimization_goal || '',
          start_time: a.start_time || null,
          end_time: a.end_time || null,
          source: 'meta',
          spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
          leads: acts.leads, purchases: acts.purchases, messages: acts.messages,
          link_clicks: acts.link_clicks, revenue: acts.revenue, engagements: acts.engagements,
          followers: acts.followers, profile_visits: acts.profile_visits,
          cpa, roas,
          last_synced_at: new Date().toISOString(),
        };

        const { data: existing } = await admin.from('ad_sets')
          .select('id').eq('campaign_id', camp.id).eq('meta_adset_id', a.id).maybeSingle();
        if (existing) await admin.from('ad_sets').update(payload).eq('id', existing.id);
        else await admin.from('ad_sets').insert(payload);
        imported++;
      }
    }

    return new Response(JSON.stringify({ imported, campaigns_processed: campaigns.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
