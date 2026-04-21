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
  'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum',
]);

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
  let leads = 0, purchases = 0, messages = 0, link_clicks = 0, revenue = 0;
  for (const a of (ins?.actions || [])) {
    const v = parseFloat(a.value || '0') || 0;
    if (['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(a.action_type)) leads += v;
    if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'].includes(a.action_type)) purchases += v;
    if (['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'].includes(a.action_type)) messages += v;
    if (a.action_type === 'link_click') link_clicks += v;
  }
  for (const a of (ins?.action_values || [])) {
    if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'].includes(a.action_type)) {
      revenue += parseFloat(a.value || '0') || 0;
    }
  }
  return { leads, purchases, messages, link_clicks, revenue };
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
      const preset = VALID_PRESETS.has(date_preset) ? date_preset : 'maximum';
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
    const insightFields = 'adset_id,spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values';
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
          spend, impressions, clicks, ctr, cpc, cpm, reach,
          leads: acts.leads, purchases: acts.purchases, messages: acts.messages,
          link_clicks: acts.link_clicks, revenue: acts.revenue,
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
