import { describe, it, expect } from 'vitest';
import {
  cpfCnpjValido, mascaraCpfCnpj, mascaraCep, camposFaltando, payloadCliente, payloadAssinatura, payloadContratoAntecipado,
  payloadSetup, planejarSync, resumoCobranca, lerReferencia, efeitoDoEvento, somarMeses, proximoVencimento, receitaVariavel,
  type ClienteAsaas,
} from '../../../supabase/functions/_shared/asaas';

const ID = '11111111-2222-3333-4444-555555555555';
const base: ClienteAsaas = {
  id: ID, name: 'Maria Souza', company_name: 'Clínica Sorriso', cpf_cnpj: '11.222.333/0001-81', email: 'maria@clinica.com',
  phone: '(31) 99999-8888', postal_code: '30130-010', address_number: '100', monthly_fee: 2500, first_payment_date: '2026-12-10',
  contract_months: 3, payment_model: 'recorrente_mensal', auto_billing: true, billing_type: 'PIX', fine_pct: 2, interest_pct: 1,
  status: 'Ativo', asaas_customer_id: 'cus_1',
};

describe('documentos e máscaras', () => {
  it('valida CPF e CNPJ de verdade', () => {
    expect(cpfCnpjValido('529.982.247-25')).toBe(true);
    expect(cpfCnpjValido('111.111.111-11')).toBe(false);
    expect(cpfCnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cpfCnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cpfCnpjValido('123')).toBe(false);
  });
  it('mascara CPF, CNPJ e CEP', () => {
    expect(mascaraCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(mascaraCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraCep('30130010')).toBe('30130-010');
  });
});

describe('obrigatórios com cobrança automática', () => {
  it('aponta o que falta', () => {
    expect(camposFaltando(base)).toEqual([]);
    expect(camposFaltando({ ...base, cpf_cnpj: '123', email: '', postal_code: '', address_number: '', monthly_fee: 0, first_payment_date: null, contract_months: null }))
      .toEqual(['CPF/CNPJ válido', 'e-mail', 'CEP', 'número do endereço', 'mensalidade', 'primeiro vencimento', 'duração do contrato']);
  });
});

describe('payloads do Asaas', () => {
  it('cliente usa a empresa como nome, só dígitos e celular sem 55', () => {
    const p = payloadCliente({ ...base, phone: '+55 31 99999-8888', billing_email: 'financeiro@clinica.com' });
    expect(p).toMatchObject({ name: 'Clínica Sorriso', cpfCnpj: '11222333000181', email: 'financeiro@clinica.com', mobilePhone: '31999998888', postalCode: '30130010', externalReference: ID });
  });
  it('assinatura de 3 meses gera exatamente 3 cobranças', () => {
    const s = payloadAssinatura(base, 'Vértice');
    expect(s).toMatchObject({ customer: 'cus_1', billingType: 'PIX', value: 2500, nextDueDate: '2026-12-10', cycle: 'MONTHLY', endDate: '2027-03-09', fine: { value: 2 }, interest: { value: 1 }, externalReference: ID });
    expect(s.description).toBe('Mensalidade Vértice – Clínica Sorriso');
  });
  it('contrato antecipado: total no Pix, parcelado no cartão', () => {
    expect(payloadContratoAntecipado({ ...base, payment_model: 'antecipado_contrato' }, 'Vértice')).toMatchObject({ value: 7500, dueDate: '2026-12-10', externalReference: `${ID}:contrato` });
    const cartao = payloadContratoAntecipado({ ...base, payment_model: 'antecipado_contrato', billing_type: 'CREDIT_CARD' }, 'Vértice');
    expect(cartao).toMatchObject({ installmentCount: 3, installmentValue: 2500 });
    expect('value' in cartao).toBe(false);
  });
  it('setup vence na assinatura do contrato ou hoje', () => {
    expect(payloadSetup({ ...base, setup_fee: 900, contract_signed_at: '2026-11-30' }, 'Vértice', '2026-11-27')).toMatchObject({ value: 900, dueDate: '2026-11-30', externalReference: `${ID}:setup` });
    expect(payloadSetup({ ...base, setup_fee: 900, contract_signed_at: '2026-11-01' }, 'Vértice', '2026-11-27').dueDate).toBe('2026-11-27');
  });
  it('soma de meses respeita fim de mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(proximoVencimento('2026-08-10', '2026-11-27')).toBe('2026-12-10');
  });
});

describe('plano de sincronização', () => {
  const nada = { contrato: false, setup: false };
  it('cria assinatura e setup na primeira vez', () => {
    expect(planejarSync({ ...base, setup_fee: 500 }, null, nada).map((a) => a.tipo)).toEqual(['criar_assinatura', 'criar_setup']);
  });
  it('nunca cria assinatura se já existe id (idempotência)', () => {
    expect(planejarSync({ ...base, asaas_subscription_id: 'sub_1' }, { id: 'sub_1', deleted: true }, nada)).toEqual([]);
    expect(planejarSync({ ...base, asaas_subscription_id: 'sub_1' }, { id: 'sub_1', status: 'ACTIVE', value: 2500, billingType: 'PIX' }, nada)).toEqual([]);
  });
  it('mudou valor ou forma: atualiza cobranças pendentes também', () => {
    const a = planejarSync({ ...base, monthly_fee: 3000, billing_type: 'BOLETO', asaas_subscription_id: 'sub_1' }, { id: 'sub_1', status: 'ACTIVE', value: 2500, billingType: 'PIX' }, nada);
    expect(a).toEqual([{ tipo: 'atualizar_assinatura', dados: { value: 3000, billingType: 'BOLETO', updatePendingPayments: true } }]);
  });
  it('pausado inativa, ativo reativa com novo vencimento, encerrado remove', () => {
    const sub = { id: 'sub_1', status: 'ACTIVE', value: 2500, billingType: 'PIX' };
    expect(planejarSync({ ...base, status: 'Pausado', asaas_subscription_id: 'sub_1' }, sub, nada)).toEqual([{ tipo: 'pausar_assinatura' }]);
    expect(planejarSync({ ...base, asaas_subscription_id: 'sub_1' }, { ...sub, status: 'INACTIVE' }, nada, '2026-12-20'))
      .toEqual([{ tipo: 'reativar_assinatura', nextDueDate: '2027-01-10' }]);
    expect(planejarSync({ ...base, status: 'Encerrado', asaas_subscription_id: 'sub_1' }, sub, nada)).toEqual([{ tipo: 'remover_assinatura' }]);
  });
  it('não cria nada para cliente pausado ou encerrado sem assinatura', () => {
    expect(planejarSync({ ...base, status: 'Pausado' }, null, nada)).toEqual([]);
    expect(planejarSync({ ...base, status: 'Encerrado', setup_fee: 500 }, null, nada)).toEqual([]);
  });
  it('aguardando início já cria a assinatura (vence no primeiro vencimento)', () => {
    expect(planejarSync({ ...base, status: 'Aguardando início' }, null, nada).map((a) => a.tipo)).toEqual(['criar_assinatura']);
  });
  it('antecipado cria uma cobrança só uma vez', () => {
    const c = { ...base, payment_model: 'antecipado_contrato' as const };
    expect(planejarSync(c, null, nada).map((a) => a.tipo)).toEqual(['criar_contrato_antecipado']);
    expect(planejarSync(c, null, { contrato: true, setup: false })).toEqual([]);
  });
});

describe('resumo e receita variável', () => {
  it('resume o que vai ser criado', () => {
    expect(resumoCobranca({ ...base, setup_fee: 900 }).replace(/\s/g, ' ')).toBe('Assinatura mensal de R$ 2.500,00 a partir de 10/12/2026, por 3 meses + setup de R$ 900,00');
  });
  it('% com mínimo', () => {
    expect(receitaVariavel(10, 1000, 5000)).toBe(1000);
    expect(receitaVariavel(10, 1000, 20000)).toBe(2000);
    expect(receitaVariavel(null, null, 5000)).toBeNull();
  });
});

describe('webhook', () => {
  it('lê a referência externa', () => {
    expect(lerReferencia(ID)).toEqual({ clientId: ID, tipo: 'mensalidade' });
    expect(lerReferencia(`${ID}:setup`)).toEqual({ clientId: ID, tipo: 'setup' });
    expect(lerReferencia(`${ID}:contrato`)).toEqual({ clientId: ID, tipo: 'mensalidade' });
    expect(lerReferencia('qualquer')).toEqual({ clientId: null, tipo: 'mensalidade' });
  });
  it('mapeia eventos', () => {
    expect(efeitoDoEvento('PAYMENT_CREATED')).toEqual({ acao: 'registrar' });
    expect(efeitoDoEvento('PAYMENT_RECEIVED')).toEqual({ acao: 'pago' });
    expect(efeitoDoEvento('PAYMENT_CONFIRMED')).toEqual({ acao: 'pago' });
    expect(efeitoDoEvento('PAYMENT_OVERDUE')).toEqual({ acao: 'atrasado' });
    expect(efeitoDoEvento('PAYMENT_DELETED')).toEqual({ acao: 'status', status: 'cancelado' });
    expect(efeitoDoEvento('PAYMENT_REFUNDED')).toEqual({ acao: 'status', status: 'estornado' });
    expect(efeitoDoEvento('SUBSCRIPTION_CREATED')).toEqual({ acao: 'ignorar' });
  });
});
