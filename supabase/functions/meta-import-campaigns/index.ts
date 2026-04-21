// Importa campanhas reais da Meta + métricas básicas (insights) e faz upsert em campaigns.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { client_id } = await req.json();
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

    // 1) Listar campanhas (paginado, limite menor)
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

    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time';
    const campsUrl = `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=${fields}&limit=50&access_token=${accessToken}`;
    const campaigns = await fetchAllPages(campsUrl);
    console.log(`Found ${campaigns.length} campaigns for account ${accountId}`);

    // 2) Insights por campanha (últimos 30 dias) - paginado, opcional
    const insightsUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,actions,action_values&date_preset=last_30d&limit=100&access_token=${accessToken}`;
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

    // 3) Upsert
    let imported = 0;
    for (const c of campaigns) {
      const ins = insightsMap.get(c.id);
      const spend = ins ? parseFloat(ins.spend || '0') : 0;
      const impressions = ins ? parseInt(ins.impressions || '0') : 0;
      const clicks = ins ? parseInt(ins.clicks || '0') : 0;
      // leads (lead actions)
      let leads = 0;
      let revenue = 0;
      if (ins?.actions) {
        for (const a of ins.actions) {
          if (['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(a.action_type)) {
            leads += parseInt(a.value || '0');
          }
        }
      }
      if (ins?.action_values) {
        for (const a of ins.action_values) {
          if (['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'].includes(a.action_type)) {
            revenue += parseFloat(a.value || '0');
          }
        }
      }
      const cpa = leads > 0 ? spend / leads : 0;
      const roas = spend > 0 ? revenue / spend : 0;
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
        spend, impressions, clicks, cpa, roas,
        last_synced_at: new Date().toISOString(),
      };

      // upsert por (client_id, meta_campaign_id)
      const { data: existing } = await admin.from('campaigns')
        .select('id').eq('client_id', client_id).eq('meta_campaign_id', c.id).maybeSingle();
      if (existing) {
        await admin.from('campaigns').update(payload).eq('id', existing.id);
      } else {
        await admin.from('campaigns').insert(payload);
      }
      imported++;
    }

    return new Response(JSON.stringify({ imported, total: campaigns.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
