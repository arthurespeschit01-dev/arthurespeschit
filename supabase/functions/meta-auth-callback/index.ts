// Recebe o callback OAuth da Meta, troca code por token de longa duração e salva.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const META_APP_ID = Deno.env.get('META_APP_ID')!;
const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-auth-callback`;

function htmlClose(message: string, ok: boolean) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meta Ads</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px}
  .box{max-width:400px}
  .ok{color:#a78bfa}
  .err{color:#f87171}
  button{margin-top:16px;background:#a78bfa;color:#0a0a0a;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px}
</style>
</head>
<body>
<div class="box">
  <h2 class="${ok ? 'ok' : 'err'}">${ok ? '✓ Conta Meta conectada!' : '✗ Erro na conexão'}</h2>
  <p>${message}</p>
  <p style="opacity:.6;font-size:14px">Esta janela será fechada automaticamente...</p>
  <button onclick="doClose()">Fechar janela</button>
</div>
<script>
  function doClose(){
    try{ if(window.opener && !window.opener.closed){ window.opener.postMessage({type:'meta-oauth',ok:${ok}},'*'); } }catch(e){}
    try{ window.close(); }catch(e){}
  }
  try{ if(window.opener && !window.opener.closed){ window.opener.postMessage({type:'meta-oauth',ok:${ok}},'*'); } }catch(e){}
  setTimeout(doClose, 1200);
</script>
</body>
</html>`;
}

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');

  if (error) {
    return new Response(htmlClose(error, false), { headers: HTML_HEADERS });
  }
  if (!code || !state) {
    return new Response(htmlClose('Parâmetros ausentes', false), { headers: HTML_HEADERS });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: stateRow, error: stateErr } = await admin
      .from('meta_oauth_states').select('*').eq('state', state).maybeSingle();
    if (stateErr || !stateRow) throw new Error('State inválido ou expirado');

    // 1) Trocar code por short-lived token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    tokenUrl.searchParams.set('code', code);
    const shortRes = await fetch(tokenUrl.toString());
    const shortData = await shortRes.json();
    if (!shortRes.ok) throw new Error(`Token exchange: ${JSON.stringify(shortData)}`);

    // 2) Trocar por long-lived token (60 dias)
    const longUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', META_APP_ID);
    longUrl.searchParams.set('client_secret', META_APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortData.access_token);
    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (!longRes.ok) throw new Error(`Long token: ${JSON.stringify(longData)}`);

    const accessToken = longData.access_token as string;
    const expiresIn = (longData.expires_in as number) || 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Pegar meta_user_id
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
    const me = await meRes.json();

    // 4) Upsert connection — se for fluxo de onboarding (sem client_id), salva em pending
    if (stateRow.client_id) {
      await admin.from('meta_connections').upsert({
        user_id: stateRow.user_id,
        client_id: stateRow.client_id,
        access_token: accessToken,
        token_expires_at: expiresAt,
        meta_user_id: me.id || null,
      }, { onConflict: 'client_id' });
    } else {
      await admin.from('meta_pending_connections').upsert({
        user_id: stateRow.user_id,
        access_token: accessToken,
        token_expires_at: expiresAt,
        meta_user_id: me.id || null,
      }, { onConflict: 'user_id' });
    }

    // 5) Limpar state
    await admin.from('meta_oauth_states').delete().eq('state', state);

    return new Response(htmlClose('Você já pode selecionar a conta de anúncio.', true), {
      headers: HTML_HEADERS,
    });
  } catch (e) {
    console.error('callback error', e);
    return new Response(htmlClose(String(e), false), { headers: HTML_HEADERS });
  }
});
