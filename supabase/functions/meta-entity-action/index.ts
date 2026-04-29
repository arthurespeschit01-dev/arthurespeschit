// Ações em entidades Meta (Campaign / AdSet / Ad):
//   - pause:    POST /{id} { status: 'PAUSED' }
//   - activate: POST /{id} { status: 'ACTIVE' }
//   - archive:  POST /{id} { status: 'ARCHIVED' }
//   - duplicate: POST /{id}/copies (usa deep_copy quando aplicável)
//
// Sincroniza o status no banco (campaigns / ad_sets / creatives).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

type EntityType = 'campaign' | 'adset' | 'ad';
type ActionType = 'pause' | 'activate' | 'archive' | 'duplicate';

const STATUS_MAP: Record<Exclude<ActionType, 'duplicate'>, string> = {
  pause: 'PAUSED',
  activate: 'ACTIVE',
  archive: 'ARCHIVED',
};

const TABLE_MAP: Record<EntityType, string> = {
  campaign: 'campaigns',
  adset: 'ad_sets',
  ad: 'creatives',
};

const ID_COLUMN: Record<EntityType, string> = {
  campaign: 'meta_campaign_id',
  adset: 'meta_adset_id',
  ad: 'meta_ad_id',
};

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

    const body = await req.json().catch(() => ({}));
    const { client_id, entity_type, meta_id, action } = body as {
      client_id: string; entity_type: EntityType; meta_id: string; action: ActionType;
    };

    if (!client_id || !entity_type || !meta_id || !action) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
    }
    if (!['campaign', 'adset', 'ad'].includes(entity_type)) {
      return new Response(JSON.stringify({ error: 'invalid_entity_type' }), { status: 400, headers: corsHeaders });
    }
    if (!['pause', 'activate', 'archive', 'duplicate'].includes(action)) {
      return new Response(JSON.stringify({ error: 'invalid_action' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin.from('meta_connections')
      .select('access_token').eq('client_id', client_id).eq('user_id', userId).maybeSingle();
    if (!conn?.access_token) {
      return new Response(JSON.stringify({ error: 'no_connection' }), { status: 404, headers: corsHeaders });
    }

    let metaResponse: any = null;

    if (action === 'duplicate') {
      // Endpoint /copies — para Campaign aceita deep_copy
      const params = new URLSearchParams();
      params.set('access_token', conn.access_token);
      if (entity_type === 'campaign') params.set('deep_copy', 'true');
      // Status final do duplicado: PAUSED (boa prática)
      params.set('status_option', 'PAUSED');
      const r = await fetch(`${GRAPH}/${meta_id}/copies`, { method: 'POST', body: params });
      metaResponse = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: metaResponse?.error?.message || 'meta_error', meta: metaResponse }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const newStatus = STATUS_MAP[action];
      const params = new URLSearchParams();
      params.set('status', newStatus);
      params.set('access_token', conn.access_token);
      const r = await fetch(`${GRAPH}/${meta_id}`, { method: 'POST', body: params });
      metaResponse = await r.json();
      if (!r.ok || metaResponse?.success === false) {
        return new Response(JSON.stringify({ error: metaResponse?.error?.message || 'meta_error', meta: metaResponse }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Atualiza no banco
      const table = TABLE_MAP[entity_type];
      const col = ID_COLUMN[entity_type];
      await admin.from(table as any)
        .update({ status: newStatus })
        .eq(col, meta_id)
        .eq('user_id', userId);
    }

    return new Response(JSON.stringify({ ok: true, meta: metaResponse }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
