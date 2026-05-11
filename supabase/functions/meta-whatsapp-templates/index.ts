// Lista templates de mensagem do WhatsApp Business das WABAs acessíveis pelo token Meta do cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

type TemplateOut = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  waba_id: string;
  waba_name: string;
  header_text: string;
  body_text: string;
  footer_text: string;
};

function extractText(components: any[], type: string): string {
  if (!Array.isArray(components)) return '';
  const c = components.find((x) => (x?.type || '').toUpperCase() === type);
  if (!c) return '';
  return c.text || c?.example?.body_text?.[0]?.[0] || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { client_id } = await req.json().catch(() => ({}));
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400, headers: corsHeaders });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conn } = await admin
      .from('meta_connections')
      .select('access_token, user_id')
      .eq('client_id', client_id)
      .maybeSingle();

    if (!conn || conn.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Conexão Meta não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = conn.access_token;

    // 1) Lista negócios do usuário
    const bizRes = await fetch(`${GRAPH}/me/businesses?fields=id,name&limit=100&access_token=${token}`);
    const bizData = await bizRes.json();
    if (!bizRes.ok) {
      return new Response(JSON.stringify({
        error: 'Falha ao listar negócios',
        details: bizData?.error?.message || JSON.stringify(bizData),
        hint: 'Reconecte sua conta Meta para conceder permissão de WhatsApp Business.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const businesses: { id: string; name: string }[] = bizData?.data || [];

    // 2) Para cada business, obter WABAs (owned + client)
    const wabas: { id: string; name: string }[] = [];
    for (const b of businesses) {
      for (const path of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        const r = await fetch(`${GRAPH}/${b.id}/${path}?fields=id,name&limit=100&access_token=${token}`);
        const d = await r.json();
        if (r.ok && Array.isArray(d?.data)) {
          for (const w of d.data) {
            if (!wabas.find((x) => x.id === w.id)) wabas.push({ id: w.id, name: w.name || b.name });
          }
        }
      }
    }

    // 3) Para cada WABA, buscar templates aprovados
    const templates: TemplateOut[] = [];
    const errors: string[] = [];
    for (const w of wabas) {
      const r = await fetch(
        `${GRAPH}/${w.id}/message_templates?fields=name,language,status,category,components&limit=200&access_token=${token}`
      );
      const d = await r.json();
      if (!r.ok) {
        errors.push(`${w.name}: ${d?.error?.message || 'erro'}`);
        continue;
      }
      for (const t of (d?.data || [])) {
        templates.push({
          id: `${w.id}:${t.id || t.name}:${t.language}`,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          waba_id: w.id,
          waba_name: w.name,
          header_text: extractText(t.components, 'HEADER'),
          body_text: extractText(t.components, 'BODY'),
          footer_text: extractText(t.components, 'FOOTER'),
        });
      }
    }

    return new Response(JSON.stringify({
      templates,
      wabas_count: wabas.length,
      businesses_count: businesses.length,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('meta-whatsapp-templates error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
