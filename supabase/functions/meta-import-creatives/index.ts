// Importa criativos (ads) reais da Meta vinculando às campanhas internas via meta_campaign_id
// + insights por ad (gasto, CTR, CPA)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

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

    // Mapa meta_campaign_id -> internal campaign id
    const { data: internalCamps } = await admin.from('campaigns')
      .select('id, meta_campaign_id')
      .eq('client_id', client_id)
      .eq('source', 'meta');
    const campMap = new Map<string, string>();
    for (const c of internalCamps || []) {
      if (c.meta_campaign_id) campMap.set(c.meta_campaign_id, c.id);
    }

    // 1) Buscar ads com creative completo (alta resolução)
    const adFields = 'id,name,status,campaign_id,preview_shareable_link,creative{id,thumbnail_url,image_url,image_hash,object_story_spec,asset_feed_spec,video_id,effective_object_story_id,instagram_permalink_url}';
    const adsUrl = `${GRAPH}/${accountId}/ads?fields=${encodeURIComponent(adFields)}&limit=50&access_token=${accessToken}`;
    const ads = await fetchAllPages(adsUrl);

    // 2) Buscar insights por ad (últimos 30 dias)
    const insightFields = 'ad_id,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type';
    const insightsUrl = `${GRAPH}/${accountId}/insights?level=ad&fields=${encodeURIComponent(insightFields)}&date_preset=last_30d&limit=200&access_token=${accessToken}`;
    let insightsMap = new Map<string, any>();
    try {
      const insights = await fetchAllPages(insightsUrl);
      for (const ins of insights) insightsMap.set(ins.ad_id, ins);
    } catch (e) {
      console.warn('insights failed (continuing):', e);
    }

    const statusMap: Record<string, string> = {
      ACTIVE: 'escalando', PAUSED: 'teste', DELETED: 'morto', ARCHIVED: 'morto',
    };

    // 3) Buscar TODOS os creatives existentes dessas campanhas em uma única query
    const internalCampIds = Array.from(campMap.values());
    const existingMap = new Map<string, string>(); // meta_ad_id -> internal id
    if (internalCampIds.length > 0) {
      const { data: existingRows } = await admin.from('creatives')
        .select('id, meta_ad_id')
        .in('campaign_id', internalCampIds)
        .not('meta_ad_id', 'is', null);
      for (const r of existingRows || []) {
        if (r.meta_ad_id) existingMap.set(r.meta_ad_id, r.id);
      }
    }

    // 4) Construir payloads
    const toInsert: any[] = [];
    const toUpdate: { id: string; payload: any }[] = [];
    const now = new Date().toISOString();

    for (const ad of ads) {
      const internalCampId = campMap.get(ad.campaign_id);
      if (!internalCampId) continue;

      const cr = ad.creative || {};
      const ins = insightsMap.get(ad.id) || {};

      // Prioridade de melhor imagem (alta resolução):
      // 1) image_url (original full-size do creative)
      // 2) asset_feed_spec.images[0].url
      // 3) object_story_spec.link_data.picture (geralmente menor)
      // 4) video_data.image_url (thumb do vídeo)
      // 5) thumbnail_url (último recurso, baixa resolução)
      const oss = cr.object_story_spec || {};
      const afs = cr.asset_feed_spec || {};
      let bigImage: string | null = cr.image_url || null;
      if (!bigImage && Array.isArray(afs.images) && afs.images[0]?.url) bigImage = afs.images[0].url;
      if (!bigImage && oss.link_data?.picture) bigImage = oss.link_data.picture;
      if (!bigImage && oss.video_data?.image_url) bigImage = oss.video_data.image_url;
      const thumb = bigImage || cr.thumbnail_url || null;

      // Link de preview real do anúncio (full-size na Meta/Instagram)
      const permalink = cr.instagram_permalink_url
        || ad.preview_shareable_link
        || (cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : '')
        || bigImage
        || cr.thumbnail_url
        || '';

      const isVideo = !!cr.video_id || !!oss.video_data;

      let cpa = 0;
      const cpaArr = ins.cost_per_action_type || [];
      const leadCpa = cpaArr.find((x: any) => ['lead', 'offsite_conversion.fb_pixel_lead', 'purchase'].includes(x.action_type));
      if (leadCpa) cpa = parseFloat(leadCpa.value) || 0;

      const spend = parseFloat(ins.spend || '0') || 0;
      const ctr = parseFloat(ins.ctr || '0') || 0;
      const clicks = parseInt(ins.clicks || '0') || 0;
      const impressions = parseInt(ins.impressions || '0') || 0;

      const payload = {
        user_id: userId,
        campaign_id: internalCampId,
        name: ad.name,
        type: isVideo ? 'video' : 'imagem',
        link: permalink,
        status: statusMap[ad.status] || 'teste',
        source: 'meta',
        meta_ad_id: ad.id,
        meta_creative_id: cr.id || null,
        thumbnail_url: thumb,
        title: ad.name,
        body: spend > 0
          ? `Gasto: R$ ${spend.toFixed(2)} • CTR: ${ctr.toFixed(2)}% • CPA: R$ ${cpa.toFixed(2)} • Cliques: ${clicks} • Impressões: ${impressions}`
          : '',
        last_synced_at: now,
      };

      const existingId = existingMap.get(ad.id);
      if (existingId) toUpdate.push({ id: existingId, payload });
      else toInsert.push(payload);
    }

    // 5) Bulk insert + updates em paralelo (chunks)
    const chunk = <T,>(arr: T[], n: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    if (toInsert.length > 0) {
      for (const batch of chunk(toInsert, 100)) {
        await admin.from('creatives').insert(batch);
      }
    }
    if (toUpdate.length > 0) {
      for (const batch of chunk(toUpdate, 25)) {
        await Promise.all(batch.map(u =>
          admin.from('creatives').update(u.payload).eq('id', u.id)
        ));
      }
    }

    const imported = toInsert.length + toUpdate.length;
    return new Response(JSON.stringify({ imported, total: ads.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
