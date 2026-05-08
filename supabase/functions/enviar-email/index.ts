const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM = 'Central do Gestor <notificacoes@centraldogestor.site>';

function buildHtml(icone: string, titulo: string, mensagem: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Central do Gestor</title></head>
<body style="margin:0;padding:0;background:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e6ec;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#15151b;border:1px solid #26262f;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a8a99;">Central do Gestor</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;">
          <div style="font-size:40px;line-height:1;margin:8px 0 8px;">${icone}</div>
          <h1 style="margin:8px 0 12px;font-size:22px;font-weight:600;color:#ffffff;">${titulo}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#c4c4d1;">${mensagem}</p>
          <a href="https://arthurespeschit.lovable.app" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:14px;">Acessar o sistema →</a>
        </td></tr>
        <tr><td style="padding:28px 32px;border-top:1px solid #26262f;margin-top:24px;">
          <p style="margin:0;color:#6c6c7a;font-size:12px;">Central do Gestor · notificacoes@centraldogestor.site</p>
          <p style="margin:6px 0 0;color:#6c6c7a;font-size:12px;">Gerenciar notificações nas configurações do sistema.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { destinatario, assunto, icone = '🔔', titulo, mensagem } = await req.json();
    if (!destinatario || !assunto || !titulo || !mensagem) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios faltando' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [destinatario],
        subject: assunto,
        html: buildHtml(icone, titulo, mensagem),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend error:', data);
      return new Response(JSON.stringify({ error: data }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
