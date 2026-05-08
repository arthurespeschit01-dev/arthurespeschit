// Callback OAuth do Google Ads. Troca code por tokens e salva.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GOOGLE_ADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID')!;
const GOOGLE_ADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-ads-auth-callback`;

function htmlClose(message: string, ok: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Google Ads</title>
<style>body{font-family:system-ui;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}
.box{max-width:420px}.ok{color:#a78bfa}.err{color:#f87171}button{margin-top:16px;padding:10px 20px;background:#7c3aed;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px}</style></head>
<body><div class="box"><h2 class="${ok ? 'ok' : 'err'}">${ok ? '✓ Google Ads conectado!' : '✗ Erro na conexão'}</h2>
<p>${message}</p>
<p style="opacity:.6;font-size:14px;margin-top:20px">Você já pode fechar esta aba e voltar ao sistema.</p>
<button onclick="try{window.opener&&window.opener.postMessage({type:'google-ads-oauth',ok:${ok}},'*');}catch(e){};window.close();">Fechar</button>
</div>
<script>try{if(window.opener){window.opener.postMessage({type:'google-ads-oauth',ok:${ok}},'*');}}catch(e){}</script>
</body></html>`;
}

function decodeOrigin(state: string | null): string | null {
  if (!state || !state.includes('~')) return null;
  try { return atob(state.split('~')[1]); } catch { return null; }
}

function redirectOrHtml(origin: string | null, ok: boolean, message: string) {
  if (origin) {
    const dest = new URL(origin);
    dest.searchParams.set('google_ads', ok ? 'ok' : 'err');
    if (!ok) dest.searchParams.set('msg', message);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  }
  return new Response(htmlClose(message, ok), { headers: { 'Content-Type': 'text/html' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');
  const origin = decodeOrigin(state);

  if (error) return redirectOrHtml(origin, false, error);
  if (!code || !state) return redirectOrHtml(origin, false, 'Parâmetros ausentes');

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: stateRow } = await admin
      .from('google_ads_oauth_states').select('*').eq('state', state).maybeSingle();
    if (!stateRow) throw new Error('State inválido ou expirado');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_ADS_CLIENT_ID,
        client_secret: GOOGLE_ADS_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Token exchange: ${JSON.stringify(tokenData)}`);

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    await admin.from('google_ads_connections').upsert({
      user_id: stateRow.user_id,
      client_id: stateRow.client_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
    }, { onConflict: 'client_id' });

    await admin.from('google_ads_oauth_states').delete().eq('state', state);

    return redirectOrHtml(origin, true, 'Você já pode selecionar a conta de anúncio.');
  } catch (e) {
    console.error('google-ads-auth-callback error', e);
    return redirectOrHtml(origin, false, String(e));
  }
});
