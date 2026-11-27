// Sincroniza um cliente da Central com o Asaas (cliente, assinatura, contrato antecipado e setup).
// Chamada pelo formulário depois de salvar. {action:'disponivel'} só informa se a cobrança automática está habilitada.
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
const API_KEY = Deno.env.get('ASAAS_API_KEY') || '';
const ENV = (Deno.env.get('ASAAS_ENV') || 'sandbox').toLowerCase();
const ORG = Deno.env.get('ASAAS_ORGANIZATION_ID') || '';
const BASE = ENV === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';

class ErroAsaas extends Error {}

async function asaas(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', access_token: API_KEY, 'User-Agent': 'central-do-gestor' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const msg = (data?.errors || []).map((e: { description?: string }) => e.description).filter(Boolean).join(' ') || `HTTP ${r.status}`;
    throw new ErroAsaas(`Asaas: ${msg}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return json({ error: 'Não autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const configurado = !!API_KEY && !!ORG;

  const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Habilitado só para a organização dona da conta Asaas
  const { data: membro } = await admin.from('organization_members').select('organization_id').eq('user_id', u.user.id);
  const habilitado = configurado && (membro || []).some((m: { organization_id: string }) => m.organization_id === ORG);
  if (body?.action === 'disponivel') return json({ habilitado, ambiente: ENV });

  const clientId = String(body?.client_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: 'client_id inválido' }, 400);

  // Confere acesso pelo próprio usuário (RLS) antes de usar a chave de serviço
  const { data: visivel } = await user.from('clients').select('id, organization_id').eq('id', clientId).maybeSingle();
  if (!visivel) return json({ error: 'Cliente não encontrado' }, 404);
  if (!habilitado || visivel.organization_id !== ORG)
    return json({ error: 'Cobrança automática não está habilitada para esta conta.' }, 403);

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

    // 1) Cliente no Asaas
    if (!c.asaas_customer_id) {
      const busca = await asaas('GET', `/customers?cpfCnpj=${soDigitos(c.cpf_cnpj)}`);
      const existente = (busca?.data || []).find((x: { deleted?: boolean }) => !x.deleted);
      c.asaas_customer_id = existente?.id || (await asaas('POST', '/customers', payloadCliente(c))).id;
      await salvar({ asaas_customer_id: c.asaas_customer_id });
      executado.push(existente ? 'cliente_vinculado' : 'cliente_criado');
    } else {
      await asaas('POST', `/customers/${c.asaas_customer_id}`, payloadCliente(c));
    }

    // 2) O que já existe lá
    let assinatura: AssinaturaAsaas = null;
    if (c.asaas_subscription_id) {
      try { assinatura = await asaas('GET', `/subscriptions/${c.asaas_subscription_id}`); }
      catch { assinatura = { id: c.asaas_subscription_id, deleted: true }; }
    }
    const porRef = async (ref: string) =>
      ((await asaas('GET', `/payments?customer=${c.asaas_customer_id}&externalReference=${encodeURIComponent(ref)}`))?.data || [])
        .some((p: { deleted?: boolean }) => !p.deleted);
    const existentes = {
      contrato: c.payment_model === 'antecipado_contrato' ? await porRef(`${c.id}:contrato`) : true,
      setup: Number(c.setup_fee) > 0 ? await porRef(`${c.id}:setup`) : true,
    };

    // 3) Executa o plano
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // horário de Brasília
    for (const a of planejarSync(c, assinatura, existentes, hoje)) {
      if (a.tipo === 'criar_assinatura') {
        const s = await asaas('POST', '/subscriptions', payloadAssinatura(c, agencia));
        await salvar({ asaas_subscription_id: s.id });
      } else if (a.tipo === 'atualizar_assinatura') {
        await asaas('POST', `/subscriptions/${c.asaas_subscription_id}`, a.dados);
      } else if (a.tipo === 'pausar_assinatura') {
        await asaas('POST', `/subscriptions/${c.asaas_subscription_id}`, { status: 'INACTIVE' });
      } else if (a.tipo === 'reativar_assinatura') {
        await asaas('POST', `/subscriptions/${c.asaas_subscription_id}`, { status: 'ACTIVE', nextDueDate: a.nextDueDate });
      } else if (a.tipo === 'remover_assinatura') {
        await asaas('DELETE', `/subscriptions/${c.asaas_subscription_id}`);
      } else if (a.tipo === 'criar_contrato_antecipado') {
        await asaas('POST', '/payments', payloadContratoAntecipado(c, agencia));
      } else if (a.tipo === 'criar_setup') {
        await asaas('POST', '/payments', payloadSetup(c, agencia, hoje));
      }
      executado.push(a.tipo);
    }

    await salvar({ asaas_sync_status: 'ok', asaas_sync_error: null });
    return json({ ok: true, ambiente: ENV, executado });
  } catch (e) {
    const msg = e instanceof ErroAsaas ? e.message : 'Erro inesperado ao falar com o Asaas.';
    console.error('[asaas-sync]', clientId, e);
    await salvar({ asaas_sync_status: 'erro', asaas_sync_error: msg.slice(0, 500) });
    return json({ ok: false, error: msg }, 200);
  }
});
