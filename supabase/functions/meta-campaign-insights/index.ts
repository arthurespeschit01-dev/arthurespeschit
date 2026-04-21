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

    const fields = 'campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values,cost_per_action_type';
    let timeParam = '';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
    } else {
      const preset = VALID_PRESETS.has(date_preset) ? date_preset : 'last_30d';
      timeParam = `&date_preset=${preset}`;
    }

    const url = `${GRAPH}/${conn.selected_ad_account_id}/insights?level=campaign&fields=${fields}${timeParam}&limit=200&access_token=${conn.access_token}`;
    const insights = await fetchAllPages(url);

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

      let leads = 0;
      let purchases = 0;
      let messages = 0;
      let link_clicks = 0;
      let revenue = 0;

      for (const a of (ins.actions || [])) {
        const v = parseFloat(a.value || '0') || 0;
        if (['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(a.action_type)) leads += v;
        if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(a.action_type)) purchases += v;
        if (['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'].includes(a.action_type)) messages += v;
        if (a.action_type === 'link_click') link_clicks += v;
      }
      for (const a of (ins.action_values || [])) {
        if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(a.action_type)) {
          revenue += parseFloat(a.value || '0') || 0;
        }
      }

      const cpl = leads > 0 ? spend / leads : 0;
      const cpp = purchases > 0 ? spend / purchases : 0;
      const cpm_msg = messages > 0 ? spend / messages : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      result[ins.campaign_id] = {
        spend, impressions, clicks, ctr, cpc, cpm, reach,
        leads, purchases, messages, link_clicks, revenue,
        cpl, cpp, cpm_msg, roas,
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
