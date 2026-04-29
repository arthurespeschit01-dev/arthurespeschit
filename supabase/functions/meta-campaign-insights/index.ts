// Busca insights da Meta para campanhas de um cliente em um período específico (não persiste)
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

   const fields = 'campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
    let timeParam = '';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
    } else {
      const norm = normalizePreset(date_preset);
      const preset = VALID_PRESETS.has(norm) ? norm : 'last_30d';
      timeParam = `&date_preset=${preset}`;
    }

    // Paridade com o Gerenciador da Meta: atribuição unificada 7d_click/1d_view (padrão do Ads Manager)
    const attribParam = `&use_unified_attribution_setting=true&action_attribution_windows=${encodeURIComponent('["7d_click","1d_view"]')}&action_report_time=mixed`;

    const url = `${GRAPH}/${conn.selected_ad_account_id}/insights?level=campaign&fields=${fields}${timeParam}${attribParam}&limit=200&access_token=${conn.access_token}`;
    const insights = await fetchAllPages(url);
    if (insights[0]) {
      console.log('[meta-campaign-insights] sample action_types:', (insights[0].actions || []).map((a: any) => a.action_type));
    }

    // Agregar por campaign_id (Meta retorna 1 linha/campanha)
    const result: Record<string, any> = {};
    for (const ins of insights) {
      const spend = parseFloat(ins.spend || '0') || 0;
      const impressions = parseInt(ins.impressions || '0') || 0;
      const clicks = parseInt(ins.clicks || '0') || 0;
      const ctr = parseFloat(ins.ctr || '0') || 0;
      const cpc = parseFloat(ins.cpc || '0') || 0;
      const cpm = parseFloat(ins.cpm || '0') || 0;
      const reach = parseInt(ins.reach || '0') || 0;
      const frequency = parseFloat(ins.frequency || '0') || 0;

      // Parsing alinhado com as colunas oficiais do Gerenciador de Anúncios.
      // Cada métrica usa UM action_type específico (com fallback) — nunca soma variações
      // do mesmo evento, evitando dupla contagem.
      let messages = 0;
      let messagesFallback = 0;
      let postEng = 0;
      let pageEng = 0;
      let leadStd = 0;
      let leadGrouped = 0;
      let leadPixel = 0;
      let purchaseStd = 0;
      let purchaseOmni = 0;
      let purchasePixel = 0;
      let link_clicks = 0;
      let followers = 0;
      let profile_visits = 0;

      for (const a of (ins.actions || [])) {
        const v = parseFloat(a.value || '0') || 0;
        const t = a.action_type;

        // Mensagens — métrica oficial = onsite_conversion.messaging_conversation_started_7d
        if (t === 'onsite_conversion.messaging_conversation_started_7d') messages = v;
        else if (t === 'onsite_conversion.messaging_conversation_started') messagesFallback = Math.max(messagesFallback, v);
        else if (t === 'onsite_conversion.total_messaging_connection') messagesFallback = Math.max(messagesFallback, v);

        // Engajamentos — post_engagement já é o total agregado
        if (t === 'post_engagement') postEng = v;
        if (t === 'page_engagement') pageEng = v;

        // Leads — pegar o maior, não somar (são variações da mesma conversão)
        if (t === 'lead') leadStd = v;
        if (t === 'onsite_conversion.lead_grouped') leadGrouped = v;
        if (t === 'offsite_conversion.fb_pixel_lead') leadPixel = v;

        // Compras — pegar o maior
        if (t === 'purchase') purchaseStd = v;
        if (t === 'omni_purchase') purchaseOmni = v;
        if (t === 'offsite_conversion.fb_pixel_purchase') purchasePixel = v;

        // Cliques no link
        if (t === 'link_click') link_clicks = v;

        // Seguidores (Instagram/Facebook page follows)
        if (t === 'follow' || t === 'onsite_conversion.follow' || t === 'page_likes') {
          followers = Math.max(followers, v);
        }

        // Visitas no perfil (Instagram)
        if (t === 'onsite_conversion.profile_visit') {
          profile_visits = Math.max(profile_visits, v);
        }
      }

      if (messages === 0) messages = messagesFallback;
      const engagements = postEng > 0 ? postEng : pageEng;
      // Paridade com Ads Manager: prioridade > Math.max (evita inflar quando ambos existem)
      const leads = leadGrouped || leadStd || leadPixel;
      const purchases = purchaseOmni || purchaseStd || purchasePixel;

      // Receita: mesma ordem de prioridade das compras
      let revenueStd = 0, revenueOmni = 0, revenuePixel = 0;
      for (const a of (ins.action_values || [])) {
        const v = parseFloat(a.value || '0') || 0;
        if (a.action_type === 'purchase') revenueStd = v;
        if (a.action_type === 'omni_purchase') revenueOmni = v;
        if (a.action_type === 'offsite_conversion.fb_pixel_purchase') revenuePixel = v;
      }
      const revenue = revenueOmni || revenueStd || revenuePixel;

      const cpl = leads > 0 ? spend / leads : 0;
      const cpp = purchases > 0 ? spend / purchases : 0;
      const cpm_msg = messages > 0 ? spend / messages : 0;
      const cost_per_engagement = engagements > 0 ? spend / engagements : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      const cost_per_follower = followers > 0 ? spend / followers : 0;

      result[ins.campaign_id] = {
        spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
        leads, purchases, messages, link_clicks, revenue, engagements,
        cpl, cpp, cpm_msg, cost_per_engagement, roas,
        followers, profile_visits, cost_per_follower,
      };
    }

    return new Response(JSON.stringify({ insights: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
