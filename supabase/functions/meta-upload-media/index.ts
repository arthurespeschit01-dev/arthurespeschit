// Faz upload de imagem (image_hash) ou vídeo (video_id) para a conta de anúncios da Meta.
// Recebe arquivo como base64 (data URL ou base64 puro) ou URL pública.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

function base64ToBlob(b64: string, mime: string): Blob {
  const cleaned = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
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

    const { client_id, meta_ad_account_id, kind, file_base64, mime_type, file_name } = await req.json().catch(() => ({} as any));
    if (!client_id || !kind || !file_base64 || !mime_type) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token,selected_ad_account_id').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }
    const adAccountId = meta_ad_account_id || conn.selected_ad_account_id;
    if (!adAccountId) {
      return new Response(JSON.stringify({ error: 'no_ad_account' }), { status: 400, headers: corsHeaders });
    }

    const blob = base64ToBlob(file_base64, mime_type);
    const fd = new FormData();
    fd.append('access_token', conn.access_token);

    if (kind === 'image') {
      fd.append('source', blob, file_name || 'image.jpg');
      const r = await fetch(`${GRAPH}/${adAccountId}/adimages`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: j?.error?.message || 'meta_error', meta: j }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Resposta: { images: { 'filename': { hash, url } } }
      const first = j.images ? Object.values(j.images)[0] as any : null;
      return new Response(JSON.stringify({ ok: true, image_hash: first?.hash, url: first?.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (kind === 'video') {
      fd.append('source', blob, file_name || 'video.mp4');
      const r = await fetch(`${GRAPH}/${adAccountId}/advideos`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: j?.error?.message || 'meta_error', meta: j }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, video_id: j.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid_kind' }), { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
