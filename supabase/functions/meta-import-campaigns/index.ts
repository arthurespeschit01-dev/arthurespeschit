// Importa campanhas reais da Meta + métricas ricas (insights por objetivo) e faz upsert em campaigns.
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

function parseActions(ins: any) {
  let leads = 0, purchases = 0, messages = 0, link_clicks = 0, video_views = 0, revenue = 0;
  for (const a of (ins?.actions || [])) {
    const v = parseFloat(a.value || '0') || 0;
    if (['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(a.action_type)) leads += v;
    if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'].includes(a.action_type)) purchases += v;
    if (['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'].includes(a.action_type)) messages += v;
    if (a.action_type === 'link_click') link_clicks += v;
    if (a.action_type === 'video_view') video_views += v;
  }
  for (const a of (ins?.action_values || [])) {
    if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'].includes(a.action_type)) {
      revenue += parseFloat(a.value || '0') || 0;
    }
  }
  return { leads, purchases, messages, link_clicks, video_views, revenue };
}

function cpaForObjective(objective: string, spend: number, leads: number, purchases: number, messages: number) {
  const o = (objective || '').toUpperCase();
  if (o.includes('LEAD')) return leads > 0 ? spend / leads : 0;
  if (o.includes('SALES') || o.includes('CONVERSIONS') || o.includes('PURCHASE')) return purchases > 0 ? spend / purchases : 0;
  if (o.includes('MESSAGES') || o.includes('ENGAGEMENT')) return messages > 0 ? spend / messages : 0;
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

    const { client_id, date_preset, since, until } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('*').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn) return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    if (!conn.selected_ad_account_id) {
      return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });
    }

    const accountId = conn.selected_ad_account_id;
    const accessToken = conn.access_token;

    // Limpar campanhas Meta deste cliente que pertencem a outras contas (troca de conta)
    const { data: stale } = await admin.from('campaigns')
      .select('id')
      .eq('client_id', client_id)
      .eq('source', 'meta')
      .neq('meta_ad_account_id', accountId);
    if (stale && stale.length > 0) {
      const staleIds = stale.map((s: any) => s.id);
      await admin.from('creatives').delete().in('campaign_id', staleIds);
      await admin.from('ad_sets').delete().in('campaign_id', staleIds);
      await admin.from('campaigns').delete().in('id', staleIds);
      console.log(`Removed ${staleIds.length} stale campaigns from other accounts`);
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

    // Time param
    let timeParam = '';
    let usedPreset = 'maximum';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
      usedPreset = `${since}_${until}`;
    } else {
      const norm = normalizePreset(date_preset);
      usedPreset = VALID_PRESETS.has(norm) ? norm : 'maximum';
      timeParam = `&date_preset=${usedPreset}`;
    }

    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time';
    const campsUrl = `${GRAPH}/${accountId}/campaigns?fields=${fields}&limit=50&access_token=${accessToken}`;
    const campaigns = await fetchAllPages(campsUrl);
    console.log(`Found ${campaigns.length} campaigns for account ${accountId}`);

    // Insights ricos por campanha
    const insightFields = 'campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
    const insightsUrl = `${GRAPH}/${accountId}/insights?level=campaign&fields=${insightFields}${timeParam}&limit=200&access_token=${accessToken}`;
    const insightsMap = new Map<string, any>();
    try {
      const insights = await fetchAllPages(insightsUrl);
      for (const row of insights) insightsMap.set(row.campaign_id, row);
    } catch (e) {
      console.warn('insights failed (continuing without metrics):', String(e));
    }

    const statusMap: Record<string, string> = {
      ACTIVE: 'Ativa', PAUSED: 'Pausada', DELETED: 'Encerrada', ARCHIVED: 'Encerrada',
    };

    let imported = 0;
    for (const c of campaigns) {
      const ins = insightsMap.get(c.id);
      const spend = ins ? parseFloat(ins.spend || '0') : 0;
      const impressions = ins ? parseInt(ins.impressions || '0') : 0;
      const clicks = ins ? parseInt(ins.clicks || '0') : 0;
      const ctr = ins ? parseFloat(ins.ctr || '0') : 0;
      const cpc = ins ? parseFloat(ins.cpc || '0') : 0;
      const cpm = ins ? parseFloat(ins.cpm || '0') : 0;
      const reach = ins ? parseInt(ins.reach || '0') : 0;
      const frequency = ins ? parseFloat(ins.frequency || '0') : 0;
      const acts = parseActions(ins || {});
      const cpa = cpaForObjective(c.objective || '', spend, acts.leads, acts.purchases, acts.messages);
      const roas = spend > 0 ? acts.revenue / spend : 0;
      const budget = c.daily_budget ? parseFloat(c.daily_budget) / 100 : (c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0);

      const payload = {
        user_id: userId,
        client_id,
        name: c.name,
        platform: 'Meta Ads',
        objective: c.objective || '',
        status: statusMap[c.status] || c.status,
        start_date: c.start_time ? c.start_time.slice(0, 10) : '',
        budget,
        notes: '',
        source: 'meta',
        meta_campaign_id: c.id,
        meta_ad_account_id: accountId,
        spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
        leads: acts.leads, purchases: acts.purchases, revenue: acts.revenue,
        messages: acts.messages, link_clicks: acts.link_clicks, video_views: acts.video_views,
        cpa, roas,
        date_preset: usedPreset,
        last_synced_at: new Date().toISOString(),
      };

      const { data: existing } = await admin.from('campaigns')
        .select('id').eq('client_id', client_id).eq('meta_campaign_id', c.id).maybeSingle();
      if (existing) {
        await admin.from('campaigns').update(payload).eq('id', existing.id);
      } else {
        await admin.from('campaigns').insert(payload);
      }
      imported++;
    }

    return new Response(JSON.stringify({ imported, total: campaigns.length, date_preset: usedPreset }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
