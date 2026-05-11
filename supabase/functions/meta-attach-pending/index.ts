// Vincula a conexão Meta pendente (criada no onboarding) ao cliente recém-criado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { client_id } = await req.json().catch(() => ({}));
    if (!client_id || typeof client_id !== 'string') {
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

    // Confirma que o cliente pertence ao usuário
    const { data: clientRow, error: clientErr } = await admin
      .from('clients').select('id, user_id').eq('id', client_id).maybeSingle();
    if (clientErr || !clientRow || clientRow.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Cliente não encontrado' }), { status: 404, headers: corsHeaders });
    }

    const { data: pending } = await admin
      .from('meta_pending_connections').select('*').eq('user_id', userId).maybeSingle();
    if (!pending) {
      return new Response(JSON.stringify({ attached: false, reason: 'no-pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('meta_connections').upsert({
      user_id: userId,
      client_id,
      access_token: pending.access_token,
      token_expires_at: pending.token_expires_at,
      meta_user_id: pending.meta_user_id,
      selected_ad_account_id: pending.selected_ad_account_id || null,
      selected_ad_account_name: pending.selected_ad_account_name || null,
    }, { onConflict: 'client_id' });

    await admin.from('meta_pending_connections').delete().eq('user_id', userId);

    return new Response(JSON.stringify({ attached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-attach-pending error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
