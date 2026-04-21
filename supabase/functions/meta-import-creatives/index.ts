// Importa criativos (ads) reais da Meta vinculando às campanhas internas via meta_campaign_id
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
    if (!conn?.selected_ad_account_id) {
      return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });
    }
    const accessToken = conn.access_token;
    const accountId = conn.selected_ad_account_id;

    // Buscar campanhas internas da Meta (mapa meta_campaign_id -> campaign internal id)
    const { data: internalCamps } = await admin.from('campaigns')
      .select('id, meta_campaign_id')
      .eq('client_id', client_id)
      .eq('source', 'meta');
    const campMap = new Map<string, string>();
    for (const c of internalCamps || []) {
      if (c.meta_campaign_id) campMap.set(c.meta_campaign_id, c.id);
    }

    // Buscar ads do account (com creative expandido)
    const fields = 'id,name,status,campaign_id,creative{id,name,thumbnail_url,image_url,video_id,object_story_spec,body,title}';
    const adsRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads?fields=${encodeURIComponent(fields)}&limit=200&access_token=${accessToken}`);
    const adsData = await adsRes.json();
    if (!adsRes.ok) throw new Error(`Meta ads: ${JSON.stringify(adsData)}`);
    const ads = (adsData.data || []) as any[];

    const statusMap: Record<string, string> = {
      ACTIVE: 'escalando', PAUSED: 'teste', DELETED: 'morto', ARCHIVED: 'morto',
    };

    let imported = 0;
    for (const ad of ads) {
      const internalCampId = campMap.get(ad.campaign_id);
      if (!internalCampId) continue; // só importa criativos cuja campanha já foi importada

      const cr = ad.creative || {};
      const spec = cr.object_story_spec || {};
      const link = spec.link_data || spec.video_data || {};
      const thumb = cr.thumbnail_url || cr.image_url || link.image_url || null;
      const body = cr.body || link.message || link.description || '';
      const title = cr.title || link.name || link.title || ad.name;
      const type = cr.video_id || link.video_id ? 'video' : 'imagem';

      const payload = {
        user_id: userId,
        campaign_id: internalCampId,
        name: ad.name,
        type,
        link: thumb || '',
        status: statusMap[ad.status] || 'teste',
        source: 'meta',
        meta_ad_id: ad.id,
        meta_creative_id: cr.id || null,
        thumbnail_url: thumb,
        body,
        title,
        last_synced_at: new Date().toISOString(),
      };

      const { data: existing } = await admin.from('creatives')
        .select('id').eq('campaign_id', internalCampId).eq('meta_ad_id', ad.id).maybeSingle();
      if (existing) {
        await admin.from('creatives').update(payload).eq('id', existing.id);
      } else {
        await admin.from('creatives').insert(payload);
      }
      imported++;
    }

    return new Response(JSON.stringify({ imported, total: ads.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
