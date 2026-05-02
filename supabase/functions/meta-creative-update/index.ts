// Atualiza criativo de um anúncio. Como criativos da Meta são imutáveis quando
// ativos, criamos um NOVO creative e atualizamos o ad para apontar para ele.
//
// Suporta:
//   - alterar texto (message), título (link headline), descrição (link description)
//   - trocar imagem (via image_hash) ou vídeo (via video_id)
//   - duplicar anúncio (cria novo ad com mesmo creative)
//   - criar novo anúncio em um adset (com creative novo)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

type Mode = 'edit' | 'duplicate' | 'create';

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

    const body = await req.json().catch(() => ({} as any));
    const {
      client_id,
      mode = 'edit' as Mode,
      meta_ad_id,
      meta_adset_id,
      meta_ad_account_id,
      page_id,
      // creative fields:
      message, link, headline, description, call_to_action_type,
      greeting, prefilled_message,
      image_hash, video_id, thumbnail_url,
      name,
    } = body;

    if (!client_id || !mode) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token,selected_ad_account_id').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }
    const adAccountId = meta_ad_account_id || conn.selected_ad_account_id;

    // Para 'edit', precisamos pegar dados atuais do ad para preservar o que não mudou
    let currentSpec: any = null;
    let currentPageId: string | null = page_id || null;
    let currentLinkUrl: string | null = link || null;
    if ((mode === 'edit' || mode === 'duplicate') && meta_ad_id) {
      const r = await fetch(`${GRAPH}/${meta_ad_id}?fields=adset_id,creative{object_story_spec,asset_feed_spec,link_url}&access_token=${conn.access_token}`);
      const j = await r.json();
      if (r.ok) {
        currentSpec = j?.creative?.object_story_spec || null;
        currentPageId = currentPageId || currentSpec?.page_id || null;
        currentLinkUrl = currentLinkUrl || currentSpec?.link_data?.link || j?.creative?.link_url || null;
      }
    }

    // Monta CTA value adequado
    function buildCtaValue(): any {
      const cta = call_to_action_type;
      if (!cta) return undefined;
      if (cta === 'WHATSAPP_MESSAGE') {
        const v: any = { app_destination: 'WHATSAPP' };
        if (greeting) v.welcome_message = greeting;
        if (prefilled_message) v.lead_gen_form_id = undefined; // placeholder; usamos message_prompts via app_destination
        if (prefilled_message) v.app_destination = 'WHATSAPP';
        if (prefilled_message) v.message_prompts = [prefilled_message];
        return v;
      }
      if (cta === 'MESSAGE_PAGE') {
        const v: any = { app_destination: 'MESSENGER' };
        if (greeting) v.welcome_message = greeting;
        if (prefilled_message) v.message_prompts = [prefilled_message];
        return v;
      }
      // CTAs com link
      if (currentLinkUrl) return { link: currentLinkUrl };
      return undefined;
    }

    // Monta object_story_spec novo
    const linkData: any = {};
    if (currentSpec?.link_data) Object.assign(linkData, currentSpec.link_data);
    if (currentLinkUrl) linkData.link = currentLinkUrl;
    if (message !== undefined) linkData.message = message;
    if (headline !== undefined) linkData.name = headline;
    if (description !== undefined) linkData.description = description;
    if (call_to_action_type) {
      linkData.call_to_action = { type: call_to_action_type, value: buildCtaValue() };
    }
    if (image_hash) linkData.image_hash = image_hash;
    if (video_id) {
      linkData.video_id = video_id;
      if (thumbnail_url) linkData.image_url = thumbnail_url;
    }

    const story_spec: any = {
      page_id: currentPageId,
    };
    if (video_id) {
      story_spec.video_data = {
        video_id,
        message: linkData.message,
        title: linkData.name,
        link_description: linkData.description,
        image_url: thumbnail_url || linkData.image_url,
        call_to_action: linkData.call_to_action,
      };
    } else {
      story_spec.link_data = linkData;
    }

    if (!story_spec.page_id) {
      return new Response(JSON.stringify({ error: 'missing_page_id', detail: 'Não foi possível determinar a Página do Facebook deste criativo. Envie page_id.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cria novo creative
    const creativeParams = new URLSearchParams();
    creativeParams.set('access_token', conn.access_token);
    creativeParams.set('name', name || `Creative ${Date.now()}`);
    creativeParams.set('object_story_spec', JSON.stringify(story_spec));
    const cr = await fetch(`${GRAPH}/${adAccountId}/adcreatives`, { method: 'POST', body: creativeParams });
    const crJson = await cr.json();
    if (!cr.ok || !crJson.id) {
      return new Response(JSON.stringify({ error: crJson?.error?.message || 'creative_error', meta: crJson }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const newCreativeId = crJson.id;

    // Aplica conforme o modo
    if (mode === 'edit') {
      if (!meta_ad_id) {
        return new Response(JSON.stringify({ error: 'missing_meta_ad_id' }), { status: 400, headers: corsHeaders });
      }
      const p = new URLSearchParams();
      p.set('access_token', conn.access_token);
      p.set('creative', JSON.stringify({ creative_id: newCreativeId }));
      const ur = await fetch(`${GRAPH}/${meta_ad_id}`, { method: 'POST', body: p });
      const uj = await ur.json();
      if (!ur.ok) {
        return new Response(JSON.stringify({ error: uj?.error?.message || 'ad_update_error', meta: uj }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, creative_id: newCreativeId, ad_id: meta_ad_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'duplicate' || mode === 'create') {
      const targetAdsetId = meta_adset_id;
      if (!targetAdsetId) {
        return new Response(JSON.stringify({ error: 'missing_meta_adset_id' }), { status: 400, headers: corsHeaders });
      }
      const p = new URLSearchParams();
      p.set('access_token', conn.access_token);
      p.set('name', name || `Anúncio ${Date.now()}`);
      p.set('adset_id', targetAdsetId);
      p.set('creative', JSON.stringify({ creative_id: newCreativeId }));
      p.set('status', 'PAUSED');
      const ar = await fetch(`${GRAPH}/${adAccountId}/ads`, { method: 'POST', body: p });
      const aj = await ar.json();
      if (!ar.ok || !aj.id) {
        return new Response(JSON.stringify({ error: aj?.error?.message || 'ad_create_error', meta: aj }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, creative_id: newCreativeId, ad_id: aj.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid_mode' }), { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
