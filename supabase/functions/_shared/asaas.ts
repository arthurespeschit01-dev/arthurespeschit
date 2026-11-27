// Regras puras da integração com o Asaas (sem rede). Usadas pelas funções asaas-sync e asaas-webhook,
// pelo formulário de cliente e testadas no Vitest.

export type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
export type PaymentModel = "recorrente_mensal" | "antecipado_contrato";

export type ClienteAsaas = {
  id: string;
  name: string;
  company_name?: string | null;
  cpf_cnpj?: string | null;
  email?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  street?: string | null;
  address_number?: string | null;
  complement?: string | null;
  province?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  monthly_fee?: number | string | null;
  first_payment_date?: string | null;
  contract_signed_at?: string | null;
  contract_months?: number | null;
  payment_model?: PaymentModel | null;
  setup_fee?: number | string | null;
  auto_billing?: boolean | null;
  billing_type?: BillingType | null;
  fine_pct?: number | string | null;
  interest_pct?: number | string | null;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
};

export const soDigitos = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dig = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dig(12) === Number(d[12]) && dig(13) === Number(d[13]);
}

export const cpfCnpjValido = (v?: string | null) => {
  const d = soDigitos(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
};

export function mascaraCpfCnpj(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

export const mascaraCep = (v: string) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

// Soma meses mantendo o dia (ou o último dia do mês, quando o mês é mais curto)
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
const menosUmDia = (data: string) => {
  const x = new Date(data + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};
const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const dinheiro = (v: number) => Math.round(v * 100) / 100;

// Campos obrigatórios quando a cobrança automática está ligada
export function camposFaltando(c: ClienteAsaas): string[] {
  const f: string[] = [];
  if (!cpfCnpjValido(c.cpf_cnpj)) f.push("CPF/CNPJ válido");
  if (!/^\S+@\S+\.\S+$/.test(String(c.email || "").trim())) f.push("e-mail");
  if (soDigitos(c.postal_code).length !== 8) f.push("CEP");
  if (!String(c.address_number || "").trim()) f.push("número do endereço");
  if (!(num(c.monthly_fee) > 0)) f.push("mensalidade");
  if (!c.first_payment_date) f.push("primeiro vencimento");
  if (!(Number(c.contract_months) >= 1)) f.push("duração do contrato");
  return f;
}

export function payloadCliente(c: ClienteAsaas) {
  const fone = soDigitos(c.phone);
  return {
    name: (c.company_name || "").trim() || c.name.trim(),
    cpfCnpj: soDigitos(c.cpf_cnpj),
    email: String(c.billing_email || c.email || "").trim() || undefined,
    mobilePhone: fone.length >= 10 ? fone.replace(/^55(?=\d{10,11}$)/, "") : undefined,
    postalCode: soDigitos(c.postal_code) || undefined,
    address: c.street || undefined,
    addressNumber: c.address_number || undefined,
    complement: c.complement || undefined,
    province: c.province || undefined,
    externalReference: c.id,
    notificationDisabled: false,
  };
}

const multaJuros = (c: ClienteAsaas) => ({
  fine: { value: Number.isFinite(num(c.fine_pct)) ? num(c.fine_pct) : 2 },
  interest: { value: Number.isFinite(num(c.interest_pct)) ? num(c.interest_pct) : 1 },
});

export const descricaoBase = (c: ClienteAsaas, agencia: string) =>
  `Mensalidade ${agencia.trim()} – ${(c.company_name || "").trim() || c.name.trim()}`;

// Assinatura mensal: exatamente N cobranças a partir do primeiro vencimento
export function payloadAssinatura(c: ClienteAsaas, agencia: string) {
  const meses = Number(c.contract_months) || 0;
  return {
    customer: c.asaas_customer_id!,
    billingType: (c.billing_type || "UNDEFINED") as BillingType,
    value: dinheiro(num(c.monthly_fee)),
    nextDueDate: c.first_payment_date!,
    cycle: "MONTHLY",
    description: descricaoBase(c, agencia),
    ...(meses > 0 ? { endDate: menosUmDia(somarMeses(c.first_payment_date!, meses)) } : {}),
    ...multaJuros(c),
    externalReference: c.id,
  };
}

// Contrato pago antecipado: uma cobrança com o total (no cartão, parcelada em N vezes, até 21)
export function payloadContratoAntecipado(c: ClienteAsaas, agencia: string) {
  const meses = Math.max(1, Number(c.contract_months) || 1);
  const total = dinheiro(num(c.monthly_fee) * meses);
  const parcelar = c.billing_type === "CREDIT_CARD" && meses > 1 && meses <= 21;
  return {
    customer: c.asaas_customer_id!,
    billingType: (c.billing_type || "UNDEFINED") as BillingType,
    dueDate: c.first_payment_date!,
    description: `Contrato ${meses} ${meses === 1 ? "mês" : "meses"} ${agencia.trim()} – ${(c.company_name || "").trim() || c.name.trim()}`,
    ...(parcelar ? { installmentCount: meses, installmentValue: dinheiro(num(c.monthly_fee)) } : { value: total }),
    ...multaJuros(c),
    externalReference: `${c.id}:contrato`,
  };
}

export function payloadSetup(c: ClienteAsaas, agencia: string, hoje: string) {
  const assinatura = c.contract_signed_at && c.contract_signed_at >= hoje ? c.contract_signed_at : hoje;
  return {
    customer: c.asaas_customer_id!,
    billingType: (c.billing_type || "UNDEFINED") as BillingType,
    value: dinheiro(num(c.setup_fee)),
    dueDate: assinatura,
    description: `Setup ${agencia.trim()} – ${(c.company_name || "").trim() || c.name.trim()}`,
    ...multaJuros(c),
    externalReference: `${c.id}:setup`,
  };
}

export type AssinaturaAsaas = { id: string; status?: string; value?: number; billingType?: string; deleted?: boolean } | null;

export type Acao =
  | { tipo: "criar_assinatura" }
  | { tipo: "atualizar_assinatura"; dados: Record<string, unknown> }
  | { tipo: "pausar_assinatura" }
  | { tipo: "reativar_assinatura"; nextDueDate: string }
  | { tipo: "remover_assinatura" }
  | { tipo: "criar_contrato_antecipado" }
  | { tipo: "criar_setup" };

// Decide o que precisa ser feito no Asaas a partir do estado do cliente e do que já existe lá.
// Próximo vencimento da série (mesmo dia do primeiro vencimento), a partir de hoje
export function proximoVencimento(primeiro: string, hoje: string): string {
  let d = primeiro;
  for (let i = 1; d < hoje && i < 600; i++) d = somarMeses(primeiro, i);
  return d;
}

export function planejarSync(
  c: ClienteAsaas,
  assinatura: AssinaturaAsaas,
  existentes: { contrato: boolean; setup: boolean },
  hoje = new Date().toISOString().slice(0, 10),
): Acao[] {
  const acoes: Acao[] = [];
  const status = c.status || "Ativo";
  const encerrado = status === "Encerrado";
  const pausado = status === "Pausado";
  const assinaturaViva = !!assinatura && !assinatura.deleted;

  if ((c.payment_model || "recorrente_mensal") === "recorrente_mensal") {
    if (!assinaturaViva) {
      if (!encerrado && !pausado && !c.asaas_subscription_id) acoes.push({ tipo: "criar_assinatura" });
    } else if (encerrado) {
      acoes.push({ tipo: "remover_assinatura" });
    } else {
      if (pausado && assinatura!.status !== "INACTIVE") acoes.push({ tipo: "pausar_assinatura" });
      if (!pausado && assinatura!.status === "INACTIVE")
        acoes.push({ tipo: "reativar_assinatura", nextDueDate: proximoVencimento(c.first_payment_date || hoje, hoje) });
      const valor = dinheiro(num(c.monthly_fee));
      const forma = c.billing_type || "UNDEFINED";
      const dados: Record<string, unknown> = {};
      if (Number.isFinite(valor) && valor > 0 && Number(assinatura!.value) !== valor) dados.value = valor;
      if (assinatura!.billingType && assinatura!.billingType !== forma) dados.billingType = forma;
      if (Object.keys(dados).length) acoes.push({ tipo: "atualizar_assinatura", dados: { ...dados, updatePendingPayments: true } });
    }
  } else if (!existentes.contrato && !encerrado && !pausado) {
    acoes.push({ tipo: "criar_contrato_antecipado" });
  }

  if (num(c.setup_fee) > 0 && !existentes.setup && !encerrado) acoes.push({ tipo: "criar_setup" });
  return acoes;
}

// Resumo mostrado no formulário antes de salvar
export function resumoCobranca(c: ClienteAsaas): string {
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  const br = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");
  const meses = Number(c.contract_months) || 0;
  const fee = num(c.monthly_fee) || 0;
  const base = (c.payment_model || "recorrente_mensal") === "antecipado_contrato"
    ? c.billing_type === "CREDIT_CARD" && meses > 1 && meses <= 21
      ? `Contrato de ${fmt(fee * meses)} em ${meses}x de ${fmt(fee)} no cartão, a partir de ${br(c.first_payment_date)}`
      : `Cobrança única de ${fmt(fee * Math.max(1, meses))} (contrato de ${meses || 1} ${meses === 1 ? "mês" : "meses"}) com vencimento em ${br(c.first_payment_date)}`
    : `Assinatura mensal de ${fmt(fee)} a partir de ${br(c.first_payment_date)}${meses ? `, por ${meses} ${meses === 1 ? "mês" : "meses"}` : ""}`;
  const setup = num(c.setup_fee) > 0 ? ` + setup de ${fmt(num(c.setup_fee))}` : "";
  return base + setup;
}

// ---- Webhook ----

export type TipoCobranca = "mensalidade" | "setup";

export function lerReferencia(ref?: string | null): { clientId: string | null; tipo: TipoCobranca } {
  const [id, sufixo] = String(ref || "").split(":");
  const valido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
  return { clientId: valido, tipo: sufixo === "setup" ? "setup" : "mensalidade" };
}

export type EfeitoEvento =
  | { acao: "registrar" }                       // cria/atualiza a cobrança como pendente
  | { acao: "pago" }
  | { acao: "atrasado" }
  | { acao: "status"; status: "cancelado" | "estornado" }
  | { acao: "ignorar" };

export function efeitoDoEvento(evento: string): EfeitoEvento {
  switch (evento) {
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
    case "PAYMENT_RESTORED":
      return { acao: "registrar" };
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED_IN_CASH":
      return { acao: "pago" };
    case "PAYMENT_OVERDUE":
      return { acao: "atrasado" };
    case "PAYMENT_DELETED":
      return { acao: "status", status: "cancelado" };
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
      return { acao: "status", status: "estornado" };
    default:
      return { acao: "ignorar" };
  }
}

// Receita variável (fase 2): valor do mês = máx(% × base, mínimo)
export function receitaVariavel(pct?: number | string | null, minimo?: number | string | null, base?: number | string | null): number | null {
  const p = num(pct), m = num(minimo), b = num(base);
  if (!(p > 0) && !(m > 0)) return null;
  const calculado = p > 0 && b > 0 ? (p / 100) * b : 0;
  return dinheiro(Math.max(calculado, m > 0 ? m : 0));
}
