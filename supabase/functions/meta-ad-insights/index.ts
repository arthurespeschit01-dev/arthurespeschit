// Busca insights da Meta no nível AD para um cliente em um período (não persiste).
// Espelha exatamente o parsing de meta-campaign-insights para garantir paridade
// com o Gerenciador de Anúncios e consistência de números entre as abas.
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
  if (!p) return 'last_30d';
  if (p === 'this_week') return 'this_week_mon_sun';
  if (p === 'last_week') return 'last_week_mon_sun';
  return p;
}

async function fetchAllPages(url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = url;
  let safety = 0;
  while (next && safety < 50) {
    const r = await fetch(next);
    const j = await r.json();
    if (!r.ok) throw new Error(`Meta: ${JSON.stringify(j)}`);
    out.push(...(j.data || []));
    next = j.paging?.next || null;
    safety++;
  }
  return out;
}

function parseRow(ins: any) {
  const spend = parseFloat(ins.spend || '0') || 0;
  const impressions = parseInt(ins.impressions || '0') || 0;
  const clicks = parseInt(ins.clicks || '0') || 0;
  const ctr = parseFloat(ins.ctr || '0') || 0;
  const cpc = parseFloat(ins.cpc || '0') || 0;
  const cpm = parseFloat(ins.cpm || '0') || 0;
  const reach = parseInt(ins.reach || '0') || 0;
  const frequency = parseFloat(ins.frequency || '0') || 0;

  let messages = 0, messagesFallback = 0;
  let postEng = 0, pageEng = 0;
  let leadStd = 0, leadGrouped = 0, leadPixel = 0;
  let purchaseStd = 0, purchaseOmni = 0, purchasePixel = 0;
  let link_clicks = 0, followers = 0, profile_visits = 0;

  for (const a of (ins.actions || [])) {
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
    if (t === 'link_click') link_clicks = v;
    if (t === 'follow' || t === 'onsite_conversion.follow' || t === 'page_likes') followers = Math.max(followers, v);
    if (t === 'onsite_conversion.profile_visit') profile_visits = Math.max(profile_visits, v);
  }
  if (messages === 0) messages = messagesFallback;
  const engagements = postEng > 0 ? postEng : pageEng;
  const leads = leadGrouped || leadStd || leadPixel;
  const purchases = purchaseOmni || purchaseStd || purchasePixel;

  let revenueStd = 0, revenueOmni = 0, revenuePixel = 0;
  for (const a of (ins.action_values || [])) {
    const v = parseFloat(a.value || '0') || 0;
    if (a.action_type === 'purchase') revenueStd = v;
    if (a.action_type === 'omni_purchase') revenueOmni = v;
    if (a.action_type === 'offsite_conversion.fb_pixel_purchase') revenuePixel = v;
  }
  const revenue = revenueOmni || revenueStd || revenuePixel;

  return {
    spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
    leads, purchases, messages, link_clicks, revenue, engagements,
    cpl: leads > 0 ? spend / leads : 0,
    cpp: purchases > 0 ? spend / purchases : 0,
    cpm_msg: messages > 0 ? spend / messages : 0,
    cost_per_engagement: engagements > 0 ? spend / engagements : 0,
    roas: spend > 0 ? revenue / spend : 0,
    followers, profile_visits,
    cost_per_follower: followers > 0 ? spend / followers : 0,
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
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { client_id, date_preset, since, until } = body || {};
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token, selected_ad_account_id')
      .eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.selected_ad_account_id) {
      return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });
    }

    const fields = 'ad_id,adset_id,campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
    let timeParam = '';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
    } else {
      const norm = normalizePreset(date_preset);
      const preset = VALID_PRESETS.has(norm) ? norm : 'last_30d';
      timeParam = `&date_preset=${preset}`;
    }
    const attribParam = `&use_unified_attribution_setting=true&action_attribution_windows=${encodeURIComponent('["7d_click","1d_view"]')}&action_report_time=mixed`;

    const url = `${GRAPH}/${conn.selected_ad_account_id}/insights?level=ad&fields=${fields}${timeParam}${attribParam}&limit=500&access_token=${conn.access_token}`;
    const insights = await fetchAllPages(url);

    const result: Record<string, any> = {};
    for (const ins of insights) {
      if (!ins.ad_id) continue;
      result[ins.ad_id] = parseRow(ins);
    }

    return new Response(JSON.stringify({ insights: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
