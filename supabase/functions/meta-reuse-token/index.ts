// Verifica se o usuário já possui um token Meta válido (em meta_pending_connections
// ou em qualquer meta_connections existente) e prepara o pending para reuso no
// onboarding de um novo cliente. Assim o usuário não precisa autenticar de novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function isValid(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now() + 60_000; // 1 min de margem
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Pending já válido?
    const { data: pending } = await admin
      .from('meta_pending_connections').select('*').eq('user_id', userId).maybeSingle();
    if (pending && isValid(pending.token_expires_at)) {
      // valida via Graph API
      const okRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${pending.access_token}`);
      if (okRes.ok) {
        return new Response(JSON.stringify({ reused: true, source: 'pending' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2) Procura uma meta_connections existente do usuário com token válido
    const { data: conns } = await admin
      .from('meta_connections')
      .select('access_token, token_expires_at, meta_user_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    for (const c of conns || []) {
      if (!isValid(c.token_expires_at)) continue;
      const okRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${c.access_token}`);
      if (!okRes.ok) continue;

      // Reaproveita esse token criando/atualizando o pending (sem ad account selecionada)
      await admin.from('meta_pending_connections').upsert({
        user_id: userId,
        access_token: c.access_token,
        token_expires_at: c.token_expires_at,
        meta_user_id: c.meta_user_id,
        selected_ad_account_id: null,
        selected_ad_account_name: null,
      }, { onConflict: 'user_id' });

      return new Response(JSON.stringify({ reused: true, source: 'connection' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ reused: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-reuse-token error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
