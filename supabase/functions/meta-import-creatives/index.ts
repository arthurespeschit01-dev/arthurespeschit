// Importa criativos (ads) reais da Meta vinculando às campanhas internas via meta_campaign_id
// + insights ricos por ad (gasto, leads, compras, mensagens, ROAS, CPA por objetivo, alcance, etc.)
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
  let link_clicks = 0, video_views = 0;
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
    if (t === 'video_view') video_views = v;
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

  return { leads, purchases, messages, link_clicks, revenue, engagements, video_views, followers, profile_visits };
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
    if (!conn?.selected_ad_account_id) {
      return new Response(JSON.stringify({ error: 'no_selected_account' }), { status: 400, headers: corsHeaders });
    }
    const accessToken = conn.access_token;
    const accountId = conn.selected_ad_account_id;

    // Time param
    let timeParam = '';
    if (since && until) {
      timeParam = `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
    } else {
      const norm = normalizePreset(date_preset);
      const preset = VALID_PRESETS.has(norm) ? norm : 'maximum';
      timeParam = `&date_preset=${preset}`;
    }

    // Mapa meta_campaign_id -> { id, objective }
    const { data: internalCamps } = await admin.from('campaigns')
      .select('id, meta_campaign_id, objective')
      .eq('client_id', client_id)
      .eq('source', 'meta');
    const campMap = new Map<string, { id: string; objective: string }>();
    for (const c of internalCamps || []) {
      if (c.meta_campaign_id) campMap.set(c.meta_campaign_id, { id: c.id, objective: c.objective || '' });
    }

    // 1) Buscar ads com creative completo
    const adFields = 'id,name,status,campaign_id,adset_id,preview_shareable_link,creative{id,thumbnail_url,image_url,image_hash,object_story_spec,asset_feed_spec,video_id,effective_object_story_id,instagram_permalink_url}';
    const adsUrl = `${GRAPH}/${accountId}/ads?fields=${encodeURIComponent(adFields)}&limit=50&access_token=${accessToken}`;
    const ads = await fetchAllPages(adsUrl);

    // 2) Buscar insights ricos por ad
    const insightFields = 'ad_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
    const insightsUrl = `${GRAPH}/${accountId}/insights?level=ad&fields=${insightFields}${timeParam}&limit=200&access_token=${accessToken}`;
    const insightsMap = new Map<string, any>();
    try {
      const insights = await fetchAllPages(insightsUrl);
      for (const ins of insights) insightsMap.set(ins.ad_id, ins);
    } catch (e) {
      console.warn('insights failed (continuing):', e);
    }

    const statusMap: Record<string, string> = {
      ACTIVE: 'Ativo', PAUSED: 'Pausado', DELETED: 'Encerrada', ARCHIVED: 'Encerrada',
    };

    // 3) Buscar TODOS os creatives existentes dessas campanhas em uma única query
    const internalCampIds = Array.from(campMap.values()).map(v => v.id);
    const existingMap = new Map<string, string>();
    if (internalCampIds.length > 0) {
      const { data: existingRows } = await admin.from('creatives')
        .select('id, meta_ad_id')
        .in('campaign_id', internalCampIds)
        .not('meta_ad_id', 'is', null);
      for (const r of existingRows || []) {
        if (r.meta_ad_id) existingMap.set(r.meta_ad_id, r.id);
      }
    }

    const toInsert: any[] = [];
    const toUpdate: { id: string; payload: any }[] = [];
    const now = new Date().toISOString();

    for (const ad of ads) {
      const camp = campMap.get(ad.campaign_id);
      if (!camp) continue;

      const cr = ad.creative || {};
      const ins = insightsMap.get(ad.id) || {};

      const oss = cr.object_story_spec || {};
      const afs = cr.asset_feed_spec || {};
      let bigImage: string | null = cr.image_url || null;
      if (!bigImage && Array.isArray(afs.images) && afs.images[0]?.url) bigImage = afs.images[0].url;
      if (!bigImage && oss.link_data?.picture) bigImage = oss.link_data.picture;
      if (!bigImage && oss.video_data?.image_url) bigImage = oss.video_data.image_url;
      const thumb = bigImage || cr.thumbnail_url || null;

      const permalink = cr.instagram_permalink_url
        || ad.preview_shareable_link
        || (cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : '')
        || bigImage
        || cr.thumbnail_url
        || '';

      const isVideo = !!cr.video_id || !!oss.video_data;

      const spend = parseFloat(ins.spend || '0') || 0;
      const impressions = parseInt(ins.impressions || '0') || 0;
      const clicks = parseInt(ins.clicks || '0') || 0;
      const ctr = parseFloat(ins.ctr || '0') || 0;
      const cpc = parseFloat(ins.cpc || '0') || 0;
      const cpm = parseFloat(ins.cpm || '0') || 0;
      const reach = parseInt(ins.reach || '0') || 0;
      const frequency = parseFloat(ins.frequency || '0') || 0;
      const acts = parseActions(ins);
      const cpa = cpaForObjective(camp.objective, spend, acts.leads, acts.purchases, acts.messages);
      const roas = spend > 0 ? acts.revenue / spend : 0;

      const payload = {
        user_id: userId,
        campaign_id: camp.id,
        name: ad.name,
        type: isVideo ? 'video' : 'imagem',
        link: permalink,
        status: statusMap[ad.status] || 'Pausado',
        source: 'meta',
        meta_ad_id: ad.id,
        meta_creative_id: cr.id || null,
        meta_adset_id: ad.adset_id || null,
        thumbnail_url: thumb,
        title: ad.name,
        body: spend > 0
          ? `Gasto: R$ ${spend.toFixed(2)} • CTR: ${ctr.toFixed(2)}% • CPA: R$ ${cpa.toFixed(2)}`
          : '',
        spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
        leads: acts.leads, purchases: acts.purchases, messages: acts.messages,
        link_clicks: acts.link_clicks, revenue: acts.revenue,
        engagements: acts.engagements, video_views: acts.video_views,
        followers: acts.followers, profile_visits: acts.profile_visits,
        cpa, roas,
        last_synced_at: now,
      };

      const existingId = existingMap.get(ad.id);
      if (existingId) toUpdate.push({ id: existingId, payload });
      else toInsert.push(payload);
    }

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
