// Resumo diário de notificações: um e-mail por usuário, só com o que é novo e ainda vale.
// Chamado 1x por dia pelo agendamento do banco (?cron=<segredo>) ou pela chave de serviço.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { montarAlertas, montarResumo, novosAlertas } from '../_shared/notificacoes.ts';
import { iguaisSeguro } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

async function enviar(destinatario: string, assunto: string, titulo: string, mensagem: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ destinatario, assunto, icone: '🔔', titulo, mensagem }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Autorização: chave de serviço ou segredo do agendamento
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const cron = new URL(req.url).searchParams.get('cron') || '';
  let autorizado = !!bearer && iguaisSeguro(bearer, SERVICE_KEY);
  if (!autorizado && cron) {
    const { data } = await admin.from('notificacoes_agendamento').select('segredo').eq('id', 1).maybeSingle();
    autorizado = !!data?.segredo && iguaisSeguro(cron, data.segredo);
  }
  if (!autorizado) return json({ error: 'Não autorizado' }, 401);

  const hoje = new Date();
  const desde = new Date(hoje.getTime() - 60 * 86400000).toISOString().slice(0, 10);

  const { data: profiles } = await admin.from('profiles')
    .select('user_id, notif_email_destino, notif_config').eq('notif_email', true);

  let enviados = 0;
  const resumo: unknown[] = [];

  for (const p of profiles || []) {
    try {
      const cfg = p.notif_config || {};
      let email = p.notif_email_destino;
      if (!email) email = (await admin.auth.admin.getUserById(p.user_id)).data?.user?.email;
      if (!email) continue;
      const uid = p.user_id;

      const [cli, men, con, tar, cam] = await Promise.all([
        admin.from('clients').select('id, name, status').eq('user_id', uid),
        admin.from('mensalidades').select('id, cliente_id, valor, vencimento, status, data_pagamento').eq('user_id', uid),
        cfg.contrato_vencimento ? admin.from('signed_contracts').select('id, client_name, expiry_date, status').eq('user_id', uid) : { data: [] },
        cfg.task_vencendo ? admin.from('operational_tasks').select('id, title, status, end_date, client_id, priority').eq('user_id', uid) : { data: [] },
        (cfg.meta_verba || cfg.saldo_baixo)
          ? admin.from('campaigns').select('id, name, client_id, status, spend, budget, last_synced_at, meta_ad_account_id').eq('user_id', uid)
          : { data: [] },
      ]);

      let contas: any[] = [];
      if (cfg.saldo_baixo && (cam.data || []).length) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-account-balances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ user_id: uid }),
        });
        if (r.ok) contas = (await r.json())?.accounts || [];
        else console.error('[saldo] meta-account-balances', r.status);
      }

      const alertas = montarAlertas(cfg, hoje, {
        clientes: cli.data || [], mensalidades: men.data || [], contratos: con.data || [],
        tarefas: tar.data || [], campanhas: cam.data || [], contas,
      });
      if (!alertas.length) { resumo.push({ uid, alertas: 0 }); continue; }

      const { data: hist } = await admin.from('notificacoes_enviadas')
        .select('tipo, referencia_id, enviada_data').eq('user_id', uid).gte('enviada_data', desde);
      const ultimo = new Map<string, string>();
      for (const h of hist || []) {
        const k = `${h.tipo}|${h.referencia_id}`;
        if (!ultimo.has(k) || ultimo.get(k)! < h.enviada_data) ultimo.set(k, h.enviada_data);
      }
      // Itens de "só uma vez" mais antigos que a janela de histórico: confere direto
      const novos = novosAlertas(alertas, ultimo, hoje);
      const unicos = novos.filter((a) => a.repetirDias === 0);
      if (unicos.length) {
        const { data: antigos } = await admin.from('notificacoes_enviadas').select('tipo, referencia_id')
          .eq('user_id', uid).in('referencia_id', unicos.map((a) => a.ref));
        const ja = new Set((antigos || []).map((h) => `${h.tipo}|${h.referencia_id}`));
        for (let i = novos.length - 1; i >= 0; i--) if (novos[i].repetirDias === 0 && ja.has(`${novos[i].tipo}|${novos[i].ref}`)) novos.splice(i, 1);
      }
      if (!novos.length) { resumo.push({ uid, alertas: alertas.length, novos: 0 }); continue; }

      const { assunto, titulo, mensagem } = montarResumo(novos);
      if (await enviar(email, assunto, titulo, mensagem)) {
        await admin.from('notificacoes_enviadas').insert(novos.map((a) => ({ user_id: uid, tipo: a.tipo, referencia_id: a.ref, enviada_data: hoje.toISOString().slice(0, 10) })));
        enviados++;
      }
      resumo.push({ uid, alertas: alertas.length, novos: novos.length });
    } catch (e) {
      console.error('[notificacoes] usuário falhou', p.user_id, e);
    }
  }

  return json({ ok: true, emails: enviados, resumo });
});
