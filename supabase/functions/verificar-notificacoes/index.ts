import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');

async function jaEnviado(admin: any, user_id: string, tipo: string, ref: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from('notificacoes_enviadas')
    .select('id')
    .eq('user_id', user_id).eq('tipo', tipo).eq('referencia_id', ref).eq('enviada_data', today)
    .maybeSingle();
  return !!data;
}

async function registrar(admin: any, user_id: string, tipo: string, ref: string) {
  await admin.from('notificacoes_enviadas').insert({ user_id, tipo, referencia_id: ref });
}

async function enviar(destinatario: string, assunto: string, icone: string, titulo: string, mensagem: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ destinatario, assunto, icone, titulo, mensagem }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const addDays = (n: number) => {
    const d = new Date(today); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const day1 = addDays(1), day3 = addDays(3), day7 = addDays(7);

  // 1. Buscar profiles ativos
  const { data: profiles } = await admin.from('profiles')
    .select('user_id, notif_email_destino, notif_config')
    .eq('notif_email', true);

  if (!profiles?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let totalEnviados = 0;

  for (const p of profiles) {
    const cfg = p.notif_config || {};
    let email = p.notif_email_destino;
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(p.user_id);
      email = u?.user?.email;
    }
    if (!email) continue;

    // Buscar clientes do usuário (mapa id->nome)
    const { data: clientes } = await admin.from('clients')
      .select('id, name, monthly_fee, account_ids')
      .eq('user_id', p.user_id);
    const clienteMap = new Map((clientes || []).map((c: any) => [c.id, c]));

    // Gatilho 2 — Vencimento de contrato
    if (cfg.contrato_vencimento) {
      const { data: contratos } = await admin.from('signed_contracts')
        .select('id, client_name, expiry_date, status')
        .eq('user_id', p.user_id)
        .in('expiry_date', [day1, day7]);
      for (const c of contratos || []) {
        if (c.status === 'Cancelado' || c.status === 'Encerrado') continue;
        const dias = c.expiry_date === day1 ? 1 : 7;
        const tipo = `contrato_${dias}d`;
        if (await jaEnviado(admin, p.user_id, tipo, c.id)) continue;
        const assunto = dias === 1
          ? `🚨 Contrato vence amanhã — ${c.client_name}`
          : `📄 Contrato vence em 7 dias — ${c.client_name}`;
        const ok = await enviar(email, assunto, dias === 1 ? '🚨' : '📄', assunto.replace(/^[^\s]+ /, ''),
          `O contrato do cliente ${c.client_name} vence em ${fmtDate(c.expiry_date)}. Acesse o sistema para renovar antes do prazo.`);
        if (ok) { await registrar(admin, p.user_id, tipo, c.id); totalEnviados++; }
      }
    }

    // Gatilho 3 — Vencimento de pagamento
    if (cfg.pagamento_vencimento) {
      const { data: mens } = await admin.from('mensalidades')
        .select('id, cliente_id, valor, vencimento, status')
        .eq('user_id', p.user_id)
        .in('vencimento', [todayStr, day3])
        .neq('status', 'pago');
      for (const m of mens || []) {
        const dias = m.vencimento === todayStr ? 0 : 3;
        const tipo = `pagamento_${dias}d`;
        if (await jaEnviado(admin, p.user_id, tipo, m.id)) continue;
        const cli: any = clienteMap.get(m.cliente_id);
        const nomeCli = cli?.name || 'Cliente';
        const assunto = dias === 0
          ? `💳 Pagamento vence hoje — ${nomeCli}`
          : `💳 Pagamento vence em 3 dias — ${nomeCli}`;
        const ok = await enviar(email, assunto, '💳', assunto.replace(/^[^\s]+ /, ''),
          `O pagamento de ${fmtBRL(Number(m.valor))} do cliente ${nomeCli} vence em ${fmtDate(m.vencimento)}.`);
        if (ok) { await registrar(admin, p.user_id, tipo, m.id); totalEnviados++; }
      }
    }

    // Gatilho 4 — Inadimplência
    if (cfg.inadimplencia) {
      const dias = parseInt(cfg.inadimplencia_dias || 3);
      const limiteData = addDays(-dias);
      const { data: mens } = await admin.from('mensalidades')
        .select('id, cliente_id, valor, vencimento, status')
        .eq('user_id', p.user_id)
        .eq('status', 'atrasado')
        .lte('vencimento', limiteData);
      for (const m of mens || []) {
        const tipo = 'inadimplente';
        if (await jaEnviado(admin, p.user_id, tipo, m.id)) continue;
        const cli: any = clienteMap.get(m.cliente_id);
        const nomeCli = cli?.name || 'Cliente';
        const diasAtraso = Math.floor((today.getTime() - new Date(m.vencimento + 'T00:00:00').getTime()) / 86400000);
        const assunto = `🚨 Cliente inadimplente há ${diasAtraso} dias — ${nomeCli}`;
        const ok = await enviar(email, assunto, '🚨', `Cliente inadimplente há ${diasAtraso} dias`,
          `O cliente ${nomeCli} está com ${fmtBRL(Number(m.valor))} em aberto há ${diasAtraso} dias.`);
        if (ok) { await registrar(admin, p.user_id, tipo, m.id); totalEnviados++; }
      }
    }

    // Gatilho 6 — Tasks vencendo amanhã
    if (cfg.task_vencendo) {
      const { data: tasks } = await admin.from('operational_tasks')
        .select('id, title, priority, status, end_date, client_id')
        .eq('user_id', p.user_id)
        .eq('end_date', day1)
        .neq('status', 'concluída');
      for (const t of tasks || []) {
        if (t.status === 'cancelada') continue;
        const tipo = 'task_amanha';
        if (await jaEnviado(admin, p.user_id, tipo, t.id)) continue;
        const cli: any = t.client_id ? clienteMap.get(t.client_id) : null;
        const nomeCli = cli?.name || 'sem cliente';
        const assunto = `⏰ Task vence amanhã — ${t.title}`;
        const ok = await enviar(email, assunto, '⏰', `Task vence amanhã`,
          `A task "${t.title}" do cliente ${nomeCli} vence amanhã. Prioridade: ${t.priority}.`);
        if (ok) { await registrar(admin, p.user_id, tipo, t.id); totalEnviados++; }
      }
    }

    // Gatilho 5 — Meta Ads verba
    if (cfg.meta_verba) {
      const pct = parseFloat(cfg.meta_alerta_pct || 20) / 100;
      const { data: camps } = await admin.from('campaigns')
        .select('id, name, client_id, spend, budget')
        .eq('user_id', p.user_id);
      for (const c of camps || []) {
        const total = Number(c.budget || 0);
        const gasto = Number(c.spend || 0);
        if (total <= 0) continue;
        if (gasto / total < pct) continue;
        const tipo = 'meta_verba';
        if (await jaEnviado(admin, p.user_id, tipo, c.id)) continue;
        const cli: any = c.client_id ? clienteMap.get(c.client_id) : null;
        const nomeCli = cli?.name || 'cliente';
        const pctConsumido = Math.round((gasto / total) * 100);
        const assunto = `📉 Verba quase esgotada — ${c.name}`;
        const ok = await enviar(email, assunto, '📉', 'Verba quase esgotada',
          `A campanha ${c.name} do cliente ${nomeCli} já consumiu ${pctConsumido}% do orçamento (${fmtBRL(gasto)} de ${fmtBRL(total)}).`);
        if (ok) { await registrar(admin, p.user_id, tipo, c.id); totalEnviados++; }
      }
    }

    // Gatilho 1 — Saldo baixo (consulta meta-account-balances)
    if (cfg.saldo_baixo) {
      const limite = Number(cfg.saldo_baixo_limite || 500);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-account-balances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ user_id: p.user_id }),
        });
        if (res.ok) {
          const json = await res.json();
          const accounts = json?.accounts || [];
          for (const a of accounts) {
            const saldo = Number(a.balance ?? a.spend_cap_remaining ?? 0);
            if (saldo >= limite) continue;
            const refId = a.id || a.account_id || a.name;
            if (!refId) continue;
            const tipo = 'saldo_baixo';
            if (await jaEnviado(admin, p.user_id, tipo, refId)) continue;
            const nome = a.name || a.account_name || 'Conta';
            const assunto = `⚠️ Saldo baixo — ${nome}`;
            const ok = await enviar(email, assunto, '⚠️', 'Saldo abaixo do limite configurado',
              `A conta ${nome} está com saldo de ${fmtBRL(saldo)}, abaixo do limite de ${fmtBRL(limite)}. Acesse o sistema para tomar uma ação.`);
            if (ok) { await registrar(admin, p.user_id, tipo, refId); totalEnviados++; }
          }
        }
      } catch (e) {
        console.error('saldo_baixo falhou', e);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados: totalEnviados }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
