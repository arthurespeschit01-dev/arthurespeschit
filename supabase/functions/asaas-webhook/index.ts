// Recebe os eventos de cobrança do Asaas e atualiza mensalidades/transações na Central.
// Responde 200 sempre que o evento foi recebido (o Asaas pausa a fila depois de várias falhas);
// cada evento fica registrado em asaas_webhook_eventos e não é processado duas vezes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { efeitoDoEvento, lerReferencia } from '../_shared/asaas.ts';
import { iguaisSeguro } from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '';
const ORG = Deno.env.get('ASAAS_ORGANIZATION_ID') || '';
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });

type Pagamento = {
  id: string; customer?: string; subscription?: string; installment?: string; value?: number; dueDate?: string;
  paymentDate?: string; clientPaymentDate?: string; confirmedDate?: string; billingType?: string;
  invoiceUrl?: string; externalReference?: string; description?: string;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!TOKEN || !iguaisSeguro(req.headers.get('asaas-access-token') || '', TOKEN)) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const corpo = await req.json().catch(() => null);
  const evento = String(corpo?.event || '');
  const p: Pagamento | undefined = corpo?.payment;
  const eventoId = String(corpo?.id || (p?.id ? `${evento}:${p.id}:${corpo?.dateCreated || ''}` : ''));
  if (!eventoId || !evento) return ok({ ok: true, ignorado: 'sem evento' });

  const registrar = (resultado: string, detalhe?: string, clienteId?: string | null) =>
    admin.from('asaas_webhook_eventos').upsert(
      { id: eventoId, evento, payment_id: p?.id ?? null, cliente_id: clienteId ?? null, resultado, detalhe: detalhe?.slice(0, 500) ?? null },
      { onConflict: 'id' });

  // Não processa o mesmo evento duas vezes
  const { data: jaVisto } = await admin.from('asaas_webhook_eventos').select('resultado').eq('id', eventoId).maybeSingle();
  if (jaVisto && jaVisto.resultado !== 'erro') return ok({ ok: true, repetido: true });

  const efeito = efeitoDoEvento(evento);
  if (efeito.acao === 'ignorar' || !p?.id) { await registrar('ignorado'); return ok(); }

  try {
    // Acha o cliente: referência externa, assinatura ou cliente Asaas
    const ref = lerReferencia(p.externalReference);
    let cliente = null as null | { id: string; user_id: string; organization_id: string };
    if (ref.clientId) cliente = (await admin.from('clients').select('id, user_id, organization_id').eq('id', ref.clientId).maybeSingle()).data;
    if (!cliente && p.subscription) cliente = (await admin.from('clients').select('id, user_id, organization_id').eq('asaas_subscription_id', p.subscription).maybeSingle()).data;
    if (!cliente && p.customer) cliente = (await admin.from('clients').select('id, user_id, organization_id').eq('asaas_customer_id', p.customer).limit(1).maybeSingle()).data;
    if (!cliente) { await registrar('ignorado', 'cliente não encontrado'); return ok(); }
    if (ORG && cliente.organization_id !== ORG) { await registrar('ignorado', 'outra organização', cliente.id); return ok(); }

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const dataPagamento = p.paymentDate || p.clientPaymentDate || p.confirmedDate || hoje;

    // ---- Setup (cobrança avulsa): só vira entrada no financeiro quando é pago ----
    if (ref.tipo === 'setup') {
      if (efeito.acao === 'pago') {
        const { error } = await admin.from('transacoes').upsert({
          user_id: cliente.user_id, tipo: 'entrada', descricao: p.description || 'Setup', valor: Number(p.value || 0),
          data: dataPagamento, cliente_id: cliente.id, categoria: 'Setup', asaas_payment_id: p.id,
        }, { onConflict: 'asaas_payment_id' });
        if (error) throw error;
      } else if (efeito.acao === 'status') {
        await admin.from('transacoes').delete().eq('asaas_payment_id', p.id);
      }
      await registrar('ok', `setup ${efeito.acao}`, cliente.id);
      return ok();
    }

    // ---- Mensalidade ----
    // 1) já vinculada? 2) senão, a mensalidade que a Central gerou no mesmo mês; 3) senão, cria
    let { data: mens } = await admin.from('mensalidades').select('id, status').eq('asaas_payment_id', p.id).maybeSingle();
    if (!mens && p.dueDate) {
      const inicio = p.dueDate.slice(0, 7) + '-01';
      const fim = new Date(Date.UTC(+p.dueDate.slice(0, 4), +p.dueDate.slice(5, 7), 0)).toISOString().slice(0, 10);
      const { data: doMes } = await admin.from('mensalidades').select('id, status')
        .eq('cliente_id', cliente.id).is('asaas_payment_id', null).gte('vencimento', inicio).lte('vencimento', fim)
        .order('vencimento').limit(1).maybeSingle();
      if (doMes) {
        const { error } = await admin.from('mensalidades').update({
          asaas_payment_id: p.id, invoice_url: p.invoiceUrl ?? null, billing_type: p.billingType ?? null,
          ...(doMes.status !== 'pago' ? { valor: Number(p.value || 0), vencimento: p.dueDate } : {}),
        }).eq('id', doMes.id);
        if (error) throw error;
        mens = doMes;
      }
    }
    if (!mens) {
      if (efeito.acao === 'status') { await registrar('ignorado', 'cobrança removida sem mensalidade', cliente.id); return ok(); }
      const { data: nova, error } = await admin.from('mensalidades').insert({
        user_id: cliente.user_id, cliente_id: cliente.id, valor: Number(p.value || 0), vencimento: p.dueDate,
        status: p.dueDate && p.dueDate < hoje ? 'atrasado' : 'pendente',
        asaas_payment_id: p.id, invoice_url: p.invoiceUrl ?? null, billing_type: p.billingType ?? null,
      }).select('id, status').single();
      if (error) throw error;
      mens = nova;
    }

    let campos: Record<string, unknown> = { invoice_url: p.invoiceUrl ?? null, billing_type: p.billingType ?? null };
    if (efeito.acao === 'registrar' && mens!.status !== 'pago') {
      campos = { ...campos, valor: Number(p.value || 0), ...(p.dueDate ? { vencimento: p.dueDate } : {}) };
    } else if (efeito.acao === 'pago') {
      campos = { ...campos, status: 'pago', data_pagamento: dataPagamento };
    } else if (efeito.acao === 'atrasado' && mens!.status !== 'pago') {
      campos = { ...campos, status: 'atrasado' };
    } else if (efeito.acao === 'status') {
      campos = { ...campos, status: efeito.status };
    }
    const { error } = await admin.from('mensalidades').update(campos).eq('id', mens!.id);
    if (error) throw error;

    await registrar('ok', `mensalidade ${efeito.acao}`, cliente.id);
    return ok();
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e);
    console.error('[asaas-webhook]', evento, p?.id, msg);
    await registrar('erro', msg);
    return ok({ ok: false });
  }
});
