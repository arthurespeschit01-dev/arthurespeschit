// Campos novos do cadastro de cliente (contato, endereço, contrato e cobrança no Asaas)
import {
  camposFaltando, cpfCnpjValido, mascaraCep, mascaraCpfCnpj, receitaVariavel, resumoCobranca, soDigitos,
  type BillingType, type PaymentModel,
} from '../../supabase/functions/_shared/asaas';

export { camposFaltando, cpfCnpjValido, mascaraCep, mascaraCpfCnpj, receitaVariavel, resumoCobranca, soDigitos };
export type { BillingType, PaymentModel };

export const DURACOES = [1, 3, 6, 12, 18, 24, 36];

export type DadosCadastro = {
  company_name: string; cpf_cnpj: string; email: string; billing_email: string;
  postal_code: string; street: string; address_number: string; complement: string; province: string; city: string; state: string;
  contract_signed_at: string; contract_months: string; setup_fee: string;
  payment_model: PaymentModel;
  usa_media_fee: boolean; media_fee_pct: string; media_fee_min: string;
  usa_revenue_fee: boolean; revenue_fee_pct: string; revenue_fee_min: string;
  auto_billing: boolean; billing_type: BillingType; fine_pct: string; interest_pct: string;
};

export const cadastroVazio = (): DadosCadastro => ({
  company_name: '', cpf_cnpj: '', email: '', billing_email: '',
  postal_code: '', street: '', address_number: '', complement: '', province: '', city: '', state: '',
  contract_signed_at: '', contract_months: '', setup_fee: '',
  payment_model: 'recorrente_mensal',
  usa_media_fee: false, media_fee_pct: '', media_fee_min: '',
  usa_revenue_fee: false, revenue_fee_pct: '', revenue_fee_min: '',
  auto_billing: false, billing_type: 'UNDEFINED', fine_pct: '2', interest_pct: '1',
});

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v));

// Lê do registro salvo no banco
export function cadastroDoCliente(c: Record<string, unknown>): DadosCadastro {
  const v = cadastroVazio();
  return {
    ...v,
    company_name: txt(c.company_name), cpf_cnpj: c.cpf_cnpj ? mascaraCpfCnpj(txt(c.cpf_cnpj)) : '', email: txt(c.email), billing_email: txt(c.billing_email),
    postal_code: c.postal_code ? mascaraCep(txt(c.postal_code)) : '', street: txt(c.street), address_number: txt(c.address_number),
    complement: txt(c.complement), province: txt(c.province), city: txt(c.city), state: txt(c.state),
    contract_signed_at: txt(c.contract_signed_at),
    contract_months: txt(c.contract_months || (Number(c.contract_duration) > 0 ? Number(c.contract_duration) : '')),
    setup_fee: txt(c.setup_fee),
    payment_model: (c.payment_model as PaymentModel) || 'recorrente_mensal',
    usa_media_fee: c.media_fee_pct != null || c.media_fee_min != null, media_fee_pct: txt(c.media_fee_pct), media_fee_min: txt(c.media_fee_min),
    usa_revenue_fee: c.revenue_fee_pct != null || c.revenue_fee_min != null, revenue_fee_pct: txt(c.revenue_fee_pct), revenue_fee_min: txt(c.revenue_fee_min),
    auto_billing: !!c.auto_billing, billing_type: (c.billing_type as BillingType) || 'UNDEFINED',
    fine_pct: txt(c.fine_pct ?? 2), interest_pct: txt(c.interest_pct ?? 1),
  };
}

const numOuNull = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')));
const textoOuNull = (v: string) => (v.trim() ? v.trim() : null);

// Converte para gravar no banco (só as colunas novas)
export function colunasCadastro(d: DadosCadastro) {
  return {
    company_name: textoOuNull(d.company_name), cpf_cnpj: soDigitos(d.cpf_cnpj) || null,
    email: textoOuNull(d.email), billing_email: textoOuNull(d.billing_email),
    postal_code: soDigitos(d.postal_code) || null, street: textoOuNull(d.street), address_number: textoOuNull(d.address_number),
    complement: textoOuNull(d.complement), province: textoOuNull(d.province), city: textoOuNull(d.city), state: textoOuNull(d.state.toUpperCase()),
    contract_signed_at: d.contract_signed_at || null,
    contract_months: numOuNull(d.contract_months),
    setup_fee: numOuNull(d.setup_fee),
    payment_model: d.payment_model,
    media_fee_pct: d.usa_media_fee ? numOuNull(d.media_fee_pct) : null, media_fee_min: d.usa_media_fee ? numOuNull(d.media_fee_min) : null,
    revenue_fee_pct: d.usa_revenue_fee ? numOuNull(d.revenue_fee_pct) : null, revenue_fee_min: d.usa_revenue_fee ? numOuNull(d.revenue_fee_min) : null,
    auto_billing: d.auto_billing, billing_type: d.billing_type,
    fine_pct: numOuNull(d.fine_pct) ?? 2, interest_pct: numOuNull(d.interest_pct) ?? 1,
  };
}

// Validação antes de salvar (CPF/CNPJ sempre que preenchido; obrigatórios só com cobrança automática)
export function erroCadastro(d: DadosCadastro, base: { id?: string; name: string; monthly_fee: number; first_payment_date: string }): string | null {
  if (d.cpf_cnpj && !cpfCnpjValido(d.cpf_cnpj)) return 'CPF/CNPJ inválido.';
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'E-mail inválido.';
  if (d.billing_email && !/^\S+@\S+\.\S+$/.test(d.billing_email.trim())) return 'E-mail financeiro inválido.';
  const meses = Number(d.contract_months);
  if (d.contract_months && (!Number.isInteger(meses) || meses < 1 || meses > 120)) return 'Duração do contrato deve ser de 1 a 120 meses.';
  if (d.auto_billing) {
    const falta = camposFaltando({ id: base.id || '', name: base.name, ...colunasCadastro(d), monthly_fee: base.monthly_fee, first_payment_date: base.first_payment_date || null } as never);
    if (falta.length) return `Para gerar a cobrança no Asaas, preencha: ${falta.join(', ')}.`;
  }
  return null;
}

// Busca o endereço pelo CEP (ViaCEP)
export async function buscarCep(cep: string): Promise<Partial<DadosCadastro> | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (j?.erro) return null;
    return { street: j.logradouro || '', province: j.bairro || '', city: j.localidade || '', state: j.uf || '' };
  } catch {
    return null;
  }
}
