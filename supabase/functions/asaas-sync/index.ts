// Integração com o Asaas, por agência (organização). Ações:
//  disponivel  → estado da conexão da agência do usuário (e registra o webhook se faltar)
//  conectar    → dono/admin informa a chave de API e o ambiente; a chave vai para o Vault
//  desconectar → apaga a chave e o webhook
//  baixa       → marcar/desmarcar pago na Central reflete no Asaas
//  (padrão)    → sincroniza um cliente: cliente, assinatura, contrato antecipado e setup
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  camposFaltando, payloadAssinatura, payloadCliente, payloadContratoAntecipado, payloadSetup, planejarSync,
  soDigitos, type AssinaturaAsaas, type ClienteAsaas,
} from '../_shared/asaas.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CHAVE_LEGADA = Deno.env.get('ASAAS_API_KEY') || '';
const EVENTOS = ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'];
const baseDe = (ambiente: string) => (ambiente === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3');
const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

type Admin = ReturnType<typeof createClient>;
type Ctx = {
  org: string; apiKey: string; ambiente: string; legado: boolean;
  webhookToken: string; webhookId: string | null; webhookAmbiente: string | null; contaNome: string | null;
};

class ErroAsaas extends Error {}

async function asaas(ctx: Pick<Ctx, 'apiKey' | 'ambiente'>, method: string, path: string, body?: unknown) {
  const r = await fetch(`${baseDe(ctx.ambiente)}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: ctx.apiKey, 'User-Agent': 'central-do-gestor' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  // deno-lint-ignore no-explicit-any
  let data: any = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = {}; }
  if (!r.ok) {
    if (r.status === 401) throw new ErroAsaas('Asaas: chave de API inválida ou de outro ambiente.');
    const msg = (data?.errors || []).map((e: { description?: string }) => e.description).filter(Boolean).join(' ') || `HTTP ${r.status}`;
    throw new ErroAsaas(`Asaas: ${msg}`);
  }
  return data;
}

// Conexão da agência: chave no Vault; se não houver, conexão antiga (segredo ASAAS_API_KEY) da organização legada
async function contexto(admin: Admin, org: string): Promise<Ctx | null> {
  const { data: conta } = await admin.from('asaas_contas').select('*').eq('organization_id', org).maybeSingle();
  if (conta?.chave_id) {
    const { data: chave } = await admin.rpc('asaas_ler_chave', { p_org: org });
    if (chave) return {
      org, apiKey: chave as string, ambiente: conta.ambiente, legado: false, webhookToken: conta.webhook_token,
      webhookId: conta.webhook_id, webhookAmbiente: conta.webhook_ambiente, contaNome: conta.conta_nome,
    };
  }
  const { data: leg } = await admin.from('asaas_config').select('*').eq('id', 1).maybeSingle();
  if (leg?.organization_id === org && CHAVE_LEGADA) return {
    org, apiKey: CHAVE_LEGADA, ambiente: (Deno.env.get('ASAAS_ENV') || leg.ambiente || 'sandbox').toLowerCase(), legado: true,
    webhookToken: leg.webhook_token, webhookId: leg.webhook_id, webhookAmbiente: leg.webhook_ambiente, contaNome: null,
  };
  return null;
}

// Registra (ou atualiza) o webhook da agência no Asaas, com o token gerado pelo banco
async function garantirWebhook(admin: Admin, ctx: Ctx, email: string, forcar = false) {
  if (!forcar && ctx.webhookId && ctx.webhookAmbiente === ctx.ambiente) return;
  const url = ctx.legado ? `${SUPABASE_URL}/functions/v1/asaas-webhook` : `${SUPABASE_URL}/functions/v1/asaas-webhook?org=${ctx.org}`;
  const lista = await asaas(ctx, 'GET', '/webhooks?limit=100');
  const existente = (lista?.data || []).find((w: { url?: string }) => w.url === url);
  const corpo = { name: 'Central do Gestor', url, email, enabled: true, interrupted: false, apiVersion: 3, authToken: ctx.webhookToken, sendType: 'SEQUENTIALLY', events: EVENTOS };
  const w = existente ? await asaas(ctx, 'POST', `/webhooks/${existente.id}`, corpo) : await asaas(ctx, 'POST', '/webhooks', corpo);
  const campos = { webhook_id: w.id || existente?.id, webhook_ambiente: ctx.ambiente };
  if (ctx.legado) await admin.from('asaas_config').update(campos).eq('id', 1);
  else await admin.from('asaas_contas').update(campos).eq('organization_id', ctx.org);
  ctx.webhookId = campos.webhook_id; ctx.webhookAmbiente = ctx.ambiente;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return json({ error: 'Não autorizado' }, 401);
  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const acao = String(body?.action || 'sincronizar');

  // Agência do usuário (a primeira, como no restante do sistema)
  const { data: membros } = await admin.from('organization_members').select('organization_id, role, created_at').eq('user_id', u.user.id).order('created_at');
  const minha = membros?.[0];
  const podeConfigurar = !!minha && ['owner', 'admin'].includes(String(minha.role));

  if (acao === 'disponivel') {
    if (!minha) return json({ habilitado: false, pode_configurar: false });
    const ctx = await contexto(admin, minha.organization_id);
    let webhook = !!ctx?.webhookId && ctx?.webhookAmbiente === ctx?.ambiente;
    if (ctx && !webhook) {
      try { await garantirWebhook(admin, ctx, u.user.email || ''); webhook = true; } catch (e) { console.error('[asaas-sync] webhook', e); }
    }
    return json({ habilitado: !!ctx, ambiente: ctx?.ambiente, webhook, conta_nome: ctx?.contaNome ?? null, legado: !!ctx?.legado, pode_configurar: podeConfigurar });
  }

  if (acao === 'conectar') {
    if (!podeConfigurar) return json({ error: 'Só o dono ou um administrador da agência pode conectar o Asaas.' }, 403);
    const chave = String(body?.api_key || '').trim();
    const ambiente = body?.ambiente === 'production' ? 'production' : 'sandbox';
    if (chave.length < 20) return json({ ok: false, error: 'Cole a chave de API completa do Asaas.' });
    try {
      const teste = { apiKey: chave, ambiente };
      await asaas(teste, 'GET', '/finance/balance'); // valida a chave
      let nome: string | null = null;
      try { const info = await asaas(teste, 'GET', '/myAccount/commercialInfo/'); nome = info?.companyName || info?.name || null; } catch { /* opcional */ }
      const org = minha!.organization_id;
      const { error } = await admin.rpc('asaas_guardar_chave', { p_org: org, p_chave: chave });
      if (error) throw error;
      await admin.from('asaas_contas').update({ ambiente, conta_nome: nome, conectado_em: new Date().toISOString(), conectado_por: u.user.id, webhook_id: null, webhook_ambiente: null }).eq('organization_id', org);
      const ctx = (await contexto(admin, org))!;
      await garantirWebhook(admin, ctx, u.user.email || '', true);
      return json({ ok: true, ambiente, conta_nome: nome });
    } catch (e) {
      const msg = e instanceof ErroAsaas ? e.message : 'Não foi possível conectar ao Asaas.';
      console.error('[asaas-sync] conectar', e);
      return json({ ok: false, error: msg });
    }
  }

  if (acao === 'desconectar') {
    if (!podeConfigurar) return json({ error: 'Só o dono ou um administrador da agência pode desconectar o Asaas.' }, 403);
    const org = minha!.organization_id;
    const ctx = await contexto(admin, org);
    if (ctx && !ctx.legado && ctx.webhookId) { try { await asaas(ctx, 'DELETE', `/webhooks/${ctx.webhookId}`); } catch { /* segue */ } }
    await admin.rpc('asaas_apagar_chave', { p_org: org });
    return json({ ok: true });
  }

  if (acao === 'baixa') {
    // Confere acesso pelo próprio usuário (RLS) antes de usar a chave de serviço
    const { data: m } = await user.from('mensalidades').select('id, cliente_id, valor, asaas_payment_id, status').eq('id', String(body?.mensalidade_id || '')).maybeSingle();
    if (!m) return json({ error: 'Mensalidade não encontrada' }, 404);
    const pago = !!body?.pago;
    const hoje = hojeBR();
    if (m.asaas_payment_id) {
      const { data: c } = await admin.from('clients').select('organization_id').eq('id', m.cliente_id).single();
      const ctx = await contexto(admin, c!.organization_id);
      if (!ctx) return json({ ok: false, error: 'O Asaas da agência não está conectado.' });
      try {
        if (pago) await asaas(ctx, 'POST', `/payments/${m.asaas_payment_id}/receiveInCash`, { paymentDate: hoje, value: Number(m.valor), notifyCustomer: false });
        else await asaas(ctx, 'POST', `/payments/${m.asaas_payment_id}/undoReceivedInCash`);
      } catch (e) {
        const msg = e instanceof ErroAsaas ? e.message : 'Não foi possível atualizar o Asaas.';
        return json({ ok: false, error: msg });
      }
    }
    const { error } = await admin.from('mensalidades').update({ status: pago ? 'pago' : 'pendente', data_pagamento: pago ? hoje : null }).eq('id', m.id);
    if (error) return json({ ok: false, error: 'Asaas atualizado, mas não foi possível salvar na Central.' });
    return json({ ok: true, status: pago ? 'pago' : 'pendente', data_pagamento: pago ? hoje : null });
  }

  // ---- Sincronizar cliente ----
  const clientId = String(body?.client_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: 'client_id inválido' }, 400);
  const { data: visivel } = await user.from('clients').select('id, organization_id').eq('id', clientId).maybeSingle();
  if (!visivel) return json({ error: 'Cliente não encontrado' }, 404);
  const ctx = await contexto(admin, visivel.organization_id);
  if (!ctx) return json({ ok: false, error: 'Conecte o Asaas da agência em Configurações para gerar cobranças.' });

  const { data: cli } = await admin.from('clients').select('*').eq('id', clientId).single();
  const c = cli as ClienteAsaas & { organization_id: string };
  const salvar = (campos: Record<string, unknown>) => admin.from('clients').update(campos).eq('id', clientId);
  if (!c.auto_billing) return json({ ok: true, ignorado: 'Cobrança automática desligada' });

  try {
    const faltando = camposFaltando(c);
    if (faltando.length) throw new ErroAsaas(`Preencha: ${faltando.join(', ')}.`);
    const { data: org } = await admin.from('organizations').select('name').eq('id', c.organization_id).maybeSingle();
    const agencia = (org?.name || '').trim() || 'Agência';
    const executado: string[] = [];

    if (!c.asaas_customer_id) {
      const busca = await asaas(ctx, 'GET', `/customers?cpfCnpj=${soDigitos(c.cpf_cnpj)}`);
      const existente = (busca?.data || []).find((x: { deleted?: boolean }) => !x.deleted);
      c.asaas_customer_id = existente?.id || (await asaas(ctx, 'POST', '/customers', payloadCliente(c))).id;
      await salvar({ asaas_customer_id: c.asaas_customer_id });
      executado.push(existente ? 'cliente_vinculado' : 'cliente_criado');
    } else {
      await asaas(ctx, 'POST', `/customers/${c.asaas_customer_id}`, payloadCliente(c));
    }

    let assinatura: AssinaturaAsaas = null;
    if (c.asaas_subscription_id) {
      try { assinatura = await asaas(ctx, 'GET', `/subscriptions/${c.asaas_subscription_id}`); }
      catch { assinatura = { id: c.asaas_subscription_id, deleted: true }; }
    }
    const porRef = async (ref: string) =>
      ((await asaas(ctx, 'GET', `/payments?customer=${c.asaas_customer_id}&externalReference=${encodeURIComponent(ref)}`))?.data || [])
        .some((p: { deleted?: boolean }) => !p.deleted);
    const existentes = {
      contrato: c.payment_model === 'antecipado_contrato' ? await porRef(`${c.id}:contrato`) : true,
      setup: Number(c.setup_fee) > 0 ? await porRef(`${c.id}:setup`) : true,
    };

    const hoje = hojeBR();
    for (const a of planejarSync(c, assinatura, existentes, hoje)) {
      if (a.tipo === 'criar_assinatura') {
        const s = await asaas(ctx, 'POST', '/subscriptions', payloadAssinatura(c, agencia));
        await salvar({ asaas_subscription_id: s.id });
      } else if (a.tipo === 'atualizar_assinatura') {
        await asaas(ctx, 'POST', `/subscriptions/${c.asaas_subscription_id}`, a.dados);
      } else if (a.tipo === 'pausar_assinatura') {
        await asaas(ctx, 'POST', `/subscriptions/${c.asaas_subscription_id}`, { status: 'INACTIVE' });
      } else if (a.tipo === 'reativar_assinatura') {
        await asaas(ctx, 'POST', `/subscriptions/${c.asaas_subscription_id}`, { status: 'ACTIVE', nextDueDate: a.nextDueDate });
      } else if (a.tipo === 'remover_assinatura') {
        await asaas(ctx, 'DELETE', `/subscriptions/${c.asaas_subscription_id}`);
      } else if (a.tipo === 'criar_contrato_antecipado') {
        await asaas(ctx, 'POST', '/payments', payloadContratoAntecipado(c, agencia));
      } else if (a.tipo === 'criar_setup') {
        await asaas(ctx, 'POST', '/payments', payloadSetup(c, agencia, hoje));
      }
      executado.push(a.tipo);
    }
    await salvar({ asaas_sync_status: 'ok', asaas_sync_error: null });
    return json({ ok: true, ambiente: ctx.ambiente, executado });
  } catch (e) {
    const msg = e instanceof ErroAsaas ? e.message : 'Erro inesperado ao falar com o Asaas.';
    console.error('[asaas-sync]', clientId, e);
    await salvar({ asaas_sync_status: 'erro', asaas_sync_error: msg.slice(0, 500) });
    return json({ ok: false, error: msg }, 200);
  }
});
