// Importa ad sets da Meta para uma campanha (ou todas as campanhas Meta da conta).
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

    const { client_id, campaign_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('*').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    if (!conn.selected_ad_account_id) return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });

    const accessToken = conn.access_token;

    // Determina campanhas alvo: uma específica ou todas as Meta do cliente
    let campaignsQuery = admin.from('campaigns')
      .select('id, meta_campaign_id')
      .eq('client_id', client_id)
      .eq('user_id', userId)
      .eq('source', 'meta')
      .not('meta_campaign_id', 'is', null);
    if (campaign_id) campaignsQuery = campaignsQuery.eq('id', campaign_id);
    const { data: campaigns } = await campaignsQuery;
    if (!campaigns?.length) return new Response(JSON.stringify({ imported: 0, total: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const statusMap: Record<string, string> = {
      ACTIVE: 'Ativo', PAUSED: 'Pausado', DELETED: 'Excluído', ARCHIVED: 'Arquivado',
    };

    const fields = 'id,name,status,daily_budget,lifetime_budget,bid_strategy,optimization_goal,start_time,end_time,campaign_id';
    let imported = 0;

    for (const camp of campaigns) {
      const url = `https://graph.facebook.com/v21.0/${camp.meta_campaign_id}/adsets?fields=${fields}&limit=50&access_token=${accessToken}`;
      let adsets: any[] = [];
      try { adsets = await fetchAllPages(url); }
      catch (e) { console.warn(`adsets failed for campaign ${camp.meta_campaign_id}:`, String(e)); continue; }

      for (const a of adsets) {
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
