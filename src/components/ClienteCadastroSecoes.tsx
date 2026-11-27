import type React from 'react';
// Seções novas do cadastro de cliente: documentos, contato, endereço, contrato, pagamento, receita variável e Asaas
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  DURACOES, buscarCep, cpfCnpjValido, mascaraCep, mascaraCpfCnpj, receitaVariavel, resumoCobranca, soDigitos,
  colunasCadastro, type DadosCadastro,
} from '@/lib/cadastroCliente';

type P = { value: DadosCadastro; onChange: (v: Partial<DadosCadastro>) => void };
const campo = 'bg-secondary/50 border-border/50 mt-1';
const rotulo = 'text-muted-foreground text-sm';

export function SecaoDocumentos({ value, onChange, obrigatorio }: P & { obrigatorio: boolean }) {
  const invalido = !!value.cpf_cnpj && soDigitos(value.cpf_cnpj).length >= 11 && !cpfCnpjValido(value.cpf_cnpj);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Label className={rotulo}>Empresa / marca</Label><Input value={value.company_name} onChange={(e) => onChange({ company_name: e.target.value })} placeholder="Ex: Clínica Sorriso" className={campo} /></div>
      <div>
        <Label className={rotulo}>CPF/CNPJ{obrigatorio ? ' *' : ''}</Label>
        <Input inputMode="numeric" value={value.cpf_cnpj} onChange={(e) => onChange({ cpf_cnpj: mascaraCpfCnpj(e.target.value) })} placeholder="000.000.000-00" className={`${campo} ${invalido ? 'border-destructive' : ''}`} />
        {invalido && <p className="text-xs text-destructive mt-1">CPF/CNPJ inválido</p>}
      </div>
    </div>
  );
}

export function SecaoEmails({ value, onChange, obrigatorio, telefone }: P & { obrigatorio: boolean; telefone?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Label className={rotulo}>E-mail{obrigatorio ? ' *' : ''}</Label><Input type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="contato@cliente.com" className={campo} /></div>
      {telefone}
      <div className="sm:col-span-2"><Label className={rotulo}>E-mail financeiro <span className="text-xs">(opcional)</span></Label><Input type="email" value={value.billing_email} onChange={(e) => onChange({ billing_email: e.target.value })} placeholder="Só se as cobranças forem para outro e-mail" className={campo} /></div>
    </div>
  );
}

export function SecaoEndereco({ value, onChange, obrigatorio }: P & { obrigatorio: boolean }) {
  const [buscando, setBuscando] = useState(false);
  const aoMudarCep = async (cep: string) => {
    onChange({ postal_code: mascaraCep(cep) });
    if (soDigitos(cep).length === 8) {
      setBuscando(true);
      const end = await buscarCep(cep);
      setBuscando(false);
      if (end) onChange({ postal_code: mascaraCep(cep), ...end });
    }
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
      <div className="col-span-2">
        <Label className={rotulo}>CEP{obrigatorio ? ' *' : ''}</Label>
        <div className="relative"><Input inputMode="numeric" value={value.postal_code} onChange={(e) => aoMudarCep(e.target.value)} placeholder="00000-000" className={campo} />
          {buscando && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-muted-foreground" />}</div>
      </div>
      <div className="col-span-2 sm:col-span-4"><Label className={rotulo}>Rua</Label><Input value={value.street} onChange={(e) => onChange({ street: e.target.value })} className={campo} /></div>
      <div className="col-span-1 sm:col-span-2"><Label className={rotulo}>Número{obrigatorio ? ' *' : ''}</Label><Input value={value.address_number} onChange={(e) => onChange({ address_number: e.target.value })} className={campo} /></div>
      <div className="col-span-1 sm:col-span-4"><Label className={rotulo}>Complemento</Label><Input value={value.complement} onChange={(e) => onChange({ complement: e.target.value })} className={campo} /></div>
      <div className="col-span-2 sm:col-span-2"><Label className={rotulo}>Bairro</Label><Input value={value.province} onChange={(e) => onChange({ province: e.target.value })} className={campo} /></div>
      <div className="col-span-1 sm:col-span-3"><Label className={rotulo}>Cidade</Label><Input value={value.city} onChange={(e) => onChange({ city: e.target.value })} className={campo} /></div>
      <div className="col-span-1"><Label className={rotulo}>UF</Label><Input maxLength={2} value={value.state} onChange={(e) => onChange({ state: e.target.value.toUpperCase() })} className={campo} /></div>
    </div>
  );
}

export function SecaoContratoExtra({ value, onChange, obrigatorio }: P & { obrigatorio: boolean }) {
  const personalizado = !!value.contract_months && !DURACOES.includes(Number(value.contract_months));
  const [modoLivre, setModoLivre] = useState(personalizado);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div><Label className={rotulo}>Data de assinatura</Label><Input type="date" value={value.contract_signed_at} onChange={(e) => onChange({ contract_signed_at: e.target.value })} className={campo} /></div>
      <div>
        <Label className={rotulo}>Duração{obrigatorio ? ' *' : ''}</Label>
        {modoLivre ? (
          <div className="flex gap-2 mt-1">
            <Input type="number" min={1} max={120} value={value.contract_months} onChange={(e) => onChange({ contract_months: e.target.value })} placeholder="Meses" className="bg-secondary/50 border-border/50" />
            <button type="button" className="text-xs text-primary whitespace-nowrap" onClick={() => setModoLivre(false)}>Lista</button>
          </div>
        ) : (
          <Select value={value.contract_months || undefined} onValueChange={(v) => (v === 'outro' ? setModoLivre(true) : onChange({ contract_months: v }))}>
            <SelectTrigger className={campo}><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {DURACOES.map((m) => <SelectItem key={m} value={String(m)}>{m} {m === 1 ? 'mês' : 'meses'}</SelectItem>)}
              <SelectItem value="outro">Personalizado…</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div><Label className={rotulo}>Setup (R$, opcional)</Label><Input type="number" min={0} value={value.setup_fee} onChange={(e) => onChange({ setup_fee: e.target.value })} placeholder="0" className={campo} /></div>
    </div>
  );
}

export function SecaoModelo({ value, onChange }: P) {
  const opcoes = [
    { v: 'recorrente_mensal', t: 'Mensalidade recorrente', d: 'Cobra todo mês durante o contrato.' },
    { v: 'antecipado_contrato', t: 'Contrato pago antecipado', d: 'Uma cobrança com o total do contrato (no cartão, pode parcelar).' },
  ] as const;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {opcoes.map((o) => (
        <label key={o.v} className={`rounded-lg border p-3 cursor-pointer transition-colors ${value.payment_model === o.v ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-primary/5'}`}>
          <div className="flex items-center gap-2">
            <input type="radio" name="payment_model" className="accent-primary" checked={value.payment_model === o.v} onChange={() => onChange({ payment_model: o.v })} />
            <span className="text-sm font-medium text-foreground">{o.t}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-5">{o.d}</p>
        </label>
      ))}
    </div>
  );
}

function Linha({ marcado, onMarcar, titulo, pct, min, onPct, onMin, rodape }: {
    marcado: boolean; onMarcar: (v: boolean) => void; titulo: string; pct: string; min: string; onPct: (v: string) => void; onMin: (v: string) => void; rodape?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={marcado} onCheckedChange={(v) => onMarcar(!!v)} /><span className="text-sm text-foreground">{titulo}</span></label>
      {marcado && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-muted-foreground text-xs">Percentual (%)</Label><Input type="number" min={0} step="0.1" value={pct} onChange={(e) => onPct(e.target.value)} className={campo} /></div>
          <div><Label className="text-muted-foreground text-xs">Mínimo mensal (R$)</Label><Input type="number" min={0} value={min} onChange={(e) => onMin(e.target.value)} className={campo} /></div>
          {rodape && <p className="col-span-2 text-xs text-muted-foreground">{rodape}</p>}
        </div>
      )}
    </div>
  );
}

export function SecaoVariavel({ value, onChange, verbaMensal }: P & { verbaMensal: number }) {
  const estimativa = receitaVariavel(value.media_fee_pct, value.media_fee_min, verbaMensal);
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  return (
    <div className="space-y-3">
      <Linha marcado={value.usa_media_fee} onMarcar={(v) => onChange({ usa_media_fee: v })} titulo="% sobre investimento em mídia"
        pct={value.media_fee_pct} min={value.media_fee_min} onPct={(v) => onChange({ media_fee_pct: v })} onMin={(v) => onChange({ media_fee_min: v })}
        rodape={estimativa != null ? `Com a verba mensal de ${fmt(verbaMensal || 0)}: ${fmt(estimativa)} por mês.` : undefined} />
      <Linha marcado={value.usa_revenue_fee} onMarcar={(v) => onChange({ usa_revenue_fee: v })} titulo="% sobre faturamento do cliente"
        pct={value.revenue_fee_pct} min={value.revenue_fee_min} onPct={(v) => onChange({ revenue_fee_pct: v })} onMin={(v) => onChange({ revenue_fee_min: v })}
        rodape="O valor é calculado no fechamento do mês, a partir do faturamento informado." />
    </div>
  );
}

export function SecaoCobranca({ value, onChange, base, ambiente }: P & { base: { id?: string; name: string; monthly_fee: number; first_payment_date: string }; ambiente?: string }) {
  const resumo = resumoCobranca({ id: base.id || '', name: base.name, ...colunasCadastro(value), monthly_fee: base.monthly_fee, first_payment_date: base.first_payment_date } as never);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Gerar cobrança automática no Asaas</p>
          <p className="text-xs text-muted-foreground">Cria o cliente e as cobranças no Asaas ao salvar.{ambiente === 'sandbox' ? ' (Ambiente de teste)' : ''}</p>
        </div>
        <Switch checked={value.auto_billing} onCheckedChange={(v) => onChange({ auto_billing: v })} />
      </div>
      {value.auto_billing && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className={rotulo}>Forma de pagamento</Label>
              <Select value={value.billing_type} onValueChange={(v) => onChange({ billing_type: v as DadosCadastro['billing_type'] })}>
                <SelectTrigger className={campo}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="PIX">Pix</SelectItem>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
                  <SelectItem value="UNDEFINED">Cliente escolhe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className={rotulo}>Multa (%)</Label><Input type="number" min={0} max={10} step="0.1" value={value.fine_pct} onChange={(e) => onChange({ fine_pct: e.target.value })} className={campo} /></div>
            <div><Label className={rotulo}>Juros (% ao mês)</Label><Input type="number" min={0} max={10} step="0.1" value={value.interest_pct} onChange={(e) => onChange({ interest_pct: e.target.value })} className={campo} /></div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">{resumo}</div>
        </>
      )}
    </div>
  );
}
