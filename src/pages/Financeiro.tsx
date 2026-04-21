import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  DollarSign, TrendingDown, TrendingUp, Wallet, Percent, Clock,
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Download, FileBarChart, MessageCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Client { id: string; name: string; monthly_fee: number | null; payment_day: number | null; status: string | null; phone?: string | null; }
interface Transacao {
  id: string; tipo: 'entrada' | 'saida'; descricao: string; valor: number;
  data: string; cliente_id: string | null; categoria: string | null;
}
interface Mensalidade {
  id: string; cliente_id: string; valor: number; vencimento: string;
  status: 'pago' | 'pendente' | 'atrasado'; data_pagamento: string | null;
}

const CATEGORIAS_SAIDA = ['Ferramentas/SaaS', 'Freelancer', 'Impulsionamento', 'Infraestrutura', 'Outros'];
const CUSTOS_DIRETOS = new Set(['Freelancer', 'Impulsionamento']);

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

const monthLabel = (m: number, y: number) =>
  new Date(y, m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

export default function Financeiro() {
  const { user } = useAuth();
  const today = new Date();
  const [mes, setMes] = useState(today.getMonth());
  const [ano, setAno] = useState(today.getFullYear());

  const [clients, setClients] = useState<Client[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [loading, setLoading] = useState(true);

  const periodoStart = useMemo(() => new Date(ano, mes, 1).toISOString().slice(0, 10), [mes, ano]);
  const periodoEnd = useMemo(() => new Date(ano, mes + 1, 0).toISOString().slice(0, 10), [mes, ano]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    const [clientsRes, transRes, mensRes] = await Promise.all([
      supabase.from('clients').select('id,name,monthly_fee,payment_day,status,phone').eq('user_id', user.id).order('name'),
      supabase.from('transacoes').select('*').eq('user_id', user.id).gte('data', periodoStart).lte('data', periodoEnd).order('data', { ascending: false }),
      supabase.from('mensalidades').select('*').eq('user_id', user.id).gte('vencimento', periodoStart).lte('vencimento', periodoEnd),
    ]);
    setClients(clientsRes.data || []);
    setTransacoes((transRes.data || []) as Transacao[]);
    setMensalidades((mensRes.data || []) as Mensalidade[]);
    setLoading(false);

    // Auto-gerar mensalidades a partir de clients ativos com monthly_fee
    await ensureMensalidades(clientsRes.data || [], (mensRes.data || []) as Mensalidade[]);
  };

  const ensureMensalidades = async (cls: Client[], existing: Mensalidade[]) => {
    if (!user) return;
    const have = new Set(existing.map(m => m.cliente_id));
    const toCreate = cls
      .filter(c => {
        const st = (c.status ?? '').toLowerCase();
        const ativo = st === '' || st === 'ativo';
        return ativo && c.monthly_fee && c.monthly_fee > 0 && !have.has(c.id);
      })
      .map(c => {
        const day = Math.min(c.payment_day || 5, new Date(ano, mes + 1, 0).getDate());
        const venc = new Date(ano, mes, day).toISOString().slice(0, 10);
        return {
          user_id: user.id, cliente_id: c.id, valor: c.monthly_fee!,
          vencimento: venc, status: 'pendente',
        };
      });
    if (toCreate.length === 0) return;
    const { data } = await supabase.from('mensalidades').insert(toCreate).select('*');
    if (data) setMensalidades(prev => [...prev, ...(data as Mensalidade[])]);
  };

  // Atualizar status para "atrasado" se vencimento passou e não foi pago
  useEffect(() => {
    if (!user || mensalidades.length === 0) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const vencidas = mensalidades.filter(m => m.status === 'pendente' && m.vencimento < hoje);
    if (vencidas.length === 0) return;
    (async () => {
      await supabase.from('mensalidades').update({ status: 'atrasado' }).in('id', vencidas.map(v => v.id));
      setMensalidades(prev => prev.map(m =>
        vencidas.find(v => v.id === m.id) ? { ...m, status: 'atrasado' } : m
      ));
    })();
  }, [user, mensalidades]);

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user, mes, ano]);

  // ===== Cálculos =====
  const receitaMensalidadesPagas = mensalidades.filter(m => m.status === 'pago').reduce((s, m) => s + Number(m.valor), 0);
  const receitaAvulsa = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
  const receitaBruta = receitaMensalidadesPagas + receitaAvulsa;

  const saidas = transacoes.filter(t => t.tipo === 'saida');
  const custosDiretos = saidas.filter(t => t.cliente_id || (t.categoria && CUSTOS_DIRETOS.has(t.categoria))).reduce((s, t) => s + Number(t.valor), 0);
  const custosFixos = saidas.filter(t => !t.cliente_id && (!t.categoria || !CUSTOS_DIRETOS.has(t.categoria))).reduce((s, t) => s + Number(t.valor), 0);
  const custosVariaveis = custosDiretos;
  const lucroLiquido = receitaBruta - custosDiretos - custosFixos;
  const margem = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

  const aReceber = mensalidades.filter(m => m.status !== 'pago').reduce((s, m) => s + Number(m.valor), 0);
  const atrasados = mensalidades.filter(m => m.status === 'atrasado');
  const totalAtrasado = atrasados.reduce((s, m) => s + Number(m.valor), 0);

  // Rentabilidade por cliente
  const rentabilidade = useMemo(() => {
    return clients.map(c => {
      const recM = mensalidades.filter(m => m.cliente_id === c.id && m.status === 'pago').reduce((s, m) => s + Number(m.valor), 0);
      const recA = transacoes.filter(t => t.tipo === 'entrada' && t.cliente_id === c.id).reduce((s, t) => s + Number(t.valor), 0);
      const receita = recM + recA;
      const custo = transacoes.filter(t => t.tipo === 'saida' && t.cliente_id === c.id).reduce((s, t) => s + Number(t.valor), 0);
      const lucro = receita - custo;
      const marg = receita > 0 ? (lucro / receita) * 100 : 0;
      return { client: c, receita, custo, lucro, margem: marg };
    });
  }, [clients, transacoes, mensalidades]);

  const clientesBaixaMargem = rentabilidade.filter(r => r.margem < 20);

  // ===== Forms =====
  const [entrada, setEntrada] = useState({ descricao: '', cliente_id: '', valor: '', data: new Date().toISOString().slice(0,10) });
  const [saida, setSaida] = useState({ descricao: '', categoria: 'Outros', cliente_id: '', valor: '', data: new Date().toISOString().slice(0,10) });
  const [filtroTipo, setFiltroTipo] = useState<'todos'|'entrada'|'saida'>('todos');
  const [filtroCliente, setFiltroCliente] = useState<string>('todos');

  const addEntrada = async () => {
    if (!user || !entrada.descricao || !entrada.valor) { toast.error('Preencha descrição e valor'); return; }
    const { data, error } = await supabase.from('transacoes').insert({
      user_id: user.id, tipo: 'entrada', descricao: entrada.descricao, valor: parseFloat(entrada.valor),
      data: entrada.data, cliente_id: entrada.cliente_id || null, categoria: 'Avulso',
    }).select().single();
    if (error) { toast.error('Erro ao registrar'); return; }
    setTransacoes(prev => [data as Transacao, ...prev]);
    setEntrada({ descricao: '', cliente_id: '', valor: '', data: new Date().toISOString().slice(0,10) });
    toast.success('Entrada registrada');
  };

  const addSaida = async () => {
    if (!user || !saida.descricao || !saida.valor) { toast.error('Preencha descrição e valor'); return; }
    const { data, error } = await supabase.from('transacoes').insert({
      user_id: user.id, tipo: 'saida', descricao: saida.descricao, valor: parseFloat(saida.valor),
      data: saida.data, cliente_id: saida.cliente_id || null, categoria: saida.categoria,
    }).select().single();
    if (error) { toast.error('Erro ao registrar'); return; }
    setTransacoes(prev => [data as Transacao, ...prev]);
    setSaida({ descricao: '', categoria: 'Outros', cliente_id: '', valor: '', data: new Date().toISOString().slice(0,10) });
    toast.success('Saída registrada');
  };

  const togglePago = async (m: Mensalidade) => {
    const novo = m.status === 'pago' ? 'pendente' : 'pago';
    const dataPag = novo === 'pago' ? new Date().toISOString().slice(0,10) : null;
    await supabase.from('mensalidades').update({ status: novo, data_pagamento: dataPag }).eq('id', m.id);
    setMensalidades(prev => prev.map(x => x.id === m.id ? { ...x, status: novo as any, data_pagamento: dataPag } : x));
  };

  const transacoesFiltradas = transacoes.filter(t =>
    (filtroTipo === 'todos' || t.tipo === filtroTipo) &&
    (filtroCliente === 'todos' || t.cliente_id === filtroCliente || (filtroCliente === 'sem' && !t.cliente_id))
  );

  const clientName = (id: string | null) => id ? (clients.find(c => c.id === id)?.name || '-') : 'Custo fixo';

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`DRE - ${monthLabel(mes, ano)}`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 25);

    const rows: any[] = [];
    rows.push([{ content: 'RECEITAS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [40, 40, 50], textColor: 255 } }]);
    rows.push(['Mensalidades pagas', fmt(receitaMensalidadesPagas)]);
    rows.push(['Receitas avulsas', fmt(receitaAvulsa)]);
    rows.push([{ content: 'Total de Receitas', styles: { fontStyle: 'bold' } }, { content: fmt(receitaBruta), styles: { fontStyle: 'bold' } }]);

    rows.push([{ content: 'CUSTOS DIRETOS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [40, 40, 50], textColor: 255 } }]);
    const freel = saidas.filter(t => t.categoria === 'Freelancer').reduce((s,t)=>s+Number(t.valor),0);
    const imp = saidas.filter(t => t.categoria === 'Impulsionamento').reduce((s,t)=>s+Number(t.valor),0);
    const outrosDir = saidas.filter(t => t.cliente_id && t.categoria !== 'Freelancer' && t.categoria !== 'Impulsionamento').reduce((s,t)=>s+Number(t.valor),0);
    rows.push(['Freelancers', fmt(freel)]);
    rows.push(['Impulsionamento', fmt(imp)]);
    if (outrosDir > 0) rows.push(['Outros custos por cliente', fmt(outrosDir)]);
    rows.push([{ content: 'Total Custos Diretos', styles: { fontStyle: 'bold' } }, { content: fmt(custosDiretos), styles: { fontStyle: 'bold' } }]);

    rows.push([{ content: 'CUSTOS FIXOS', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [40, 40, 50], textColor: 255 } }]);
    for (const cat of CATEGORIAS_SAIDA) {
      const val = saidas.filter(t => !t.cliente_id && t.categoria === cat).reduce((s,t)=>s+Number(t.valor),0);
      if (val > 0) rows.push([cat, fmt(val)]);
    }
    rows.push([{ content: 'Total Custos Fixos', styles: { fontStyle: 'bold' } }, { content: fmt(custosFixos), styles: { fontStyle: 'bold' } }]);

    rows.push([
      { content: 'LUCRO LÍQUIDO', styles: { fontStyle: 'bold', fillColor: lucroLiquido >= 0 ? [22, 101, 52] : [127, 29, 29], textColor: 255 } },
      { content: `${fmt(lucroLiquido)}  (${margem.toFixed(1)}%)`, styles: { fontStyle: 'bold', fillColor: lucroLiquido >= 0 ? [22, 101, 52] : [127, 29, 29], textColor: 255 } },
    ]);

    autoTable(doc, { startY: 32, head: [['Descrição', 'Valor']], body: rows, theme: 'striped', headStyles: { fillColor: [88, 28, 135] } });
    doc.save(`DRE-${ano}-${String(mes+1).padStart(2,'0')}.pdf`);
  };

  const meses = Array.from({ length: 12 }, (_, i) => i);
  const anos = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);

  const statusBadge = (s: string) => {
    if (s === 'pago') return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Pago</Badge>;
    if (s === 'atrasado') return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Atrasado</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Aguardando</Badge>;
  };

  // ===== WhatsApp cobrança =====
  const sanitizePhone = (raw?: string | null) => (raw || '').replace(/\D/g, '');
  const buildBrazilPhone = (raw?: string | null) => {
    const digits = sanitizePhone(raw);
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  };
  const cobrancaMessage = (clienteName: string, valor: number, vencimento: string) => {
    const venc = new Date(vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
    return `Olá, ${clienteName}! Tudo bem? 👋\n\nPassando para lembrar que a mensalidade no valor de ${fmt(valor)}, com vencimento em ${venc}, está em aberto.\n\nAssim que possível, poderia confirmar o pagamento? Se já realizou, é só nos enviar o comprovante.\n\nObrigado! 🙏`;
  };
  const openWhatsApp = (m: Mensalidade) => {
    const c = clients.find(x => x.id === m.cliente_id);
    if (!c) return;
    const phone = buildBrazilPhone(c.phone);
    const text = encodeURIComponent(cobrancaMessage(c.name, Number(m.valor), m.vencimento));
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    const url = `${base}?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!phone) {
      toast.info('Cliente sem telefone cadastrado — abrimos o WhatsApp Web com a mensagem pronta para você escolher o contato.');
    }
  };
  const cobrarTodos = () => {
    if (atrasados.length === 0) return;
    const linhas = atrasados.map(m => {
      const c = clients.find(x => x.id === m.cliente_id);
      const venc = new Date(m.vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
      return `• ${c?.name || '-'} — ${fmt(Number(m.valor))} (venc. ${venc})`;
    }).join('\n');
    const text = encodeURIComponent(`Lembretes de cobrança em aberto:\n\n${linhas}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro da agência — DRE, lançamentos e rentabilidade</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => <SelectItem key={m} value={String(m)}>{new Date(2000, m, 1).toLocaleDateString('pt-BR', { month: 'long' })}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="visao" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
        </TabsList>

        {/* ===== VISÃO GERAL ===== */}
        <TabsContent value="visao" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={DollarSign} label="Receita Bruta" value={fmt(receitaBruta)} accent="text-emerald-400" />
            <KpiCard icon={TrendingDown} label="Custos Fixos" value={fmt(custosFixos)} accent="text-amber-400" />
            <KpiCard icon={TrendingDown} label="Custos Variáveis" value={fmt(custosVariaveis)} accent="text-orange-400" />
            <KpiCard icon={Wallet} label="Lucro Líquido" value={fmt(lucroLiquido)} accent={lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <KpiCard icon={Percent} label="Margem" value={`${margem.toFixed(1)}%`} accent={margem >= 30 ? 'text-emerald-400' : margem >= 10 ? 'text-amber-400' : 'text-red-400'} />
            <KpiCard icon={Clock} label="A Receber" value={fmt(aReceber)} accent="text-blue-400" />
          </div>

          {atrasados.length > 0 && (
            <Card className="p-4 bg-red-500/10 border-red-500/30 flex items-start gap-3 flex-wrap">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold text-red-300">{atrasados.length} {atrasados.length === 1 ? 'cliente com pagamento atrasado' : 'clientes com pagamentos atrasados'}</p>
                <p className="text-sm text-red-300/80">Total em atraso: <span className="font-semibold">{fmt(totalAtrasado)}</span></p>
              </div>
              <Button onClick={cobrarTodos} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
                <MessageCircle className="w-4 h-4" /> Resumo no WhatsApp
              </Button>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border"><h3 className="font-semibold">Receita por cliente — {monthLabel(mes, ano)}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr><th className="text-left p-3">Cliente</th><th className="text-left p-3">Mensalidade</th><th className="text-left p-3">Vencimento</th><th className="text-left p-3">Status</th><th className="text-right p-3">Ação</th></tr>
                </thead>
                <tbody>
                  {mensalidades.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma mensalidade no período</td></tr>}
                  {mensalidades.sort((a,b) => a.vencimento.localeCompare(b.vencimento)).map(m => {
                    const c = clients.find(x => x.id === m.cliente_id);
                    return (
                      <tr key={m.id} className="border-t border-border/50">
                        <td className="p-3 font-medium">{c?.name || '-'}</td>
                        <td className="p-3">{fmt(Number(m.valor))}</td>
                        <td className="p-3 text-muted-foreground">{new Date(m.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                        <td className="p-3">{statusBadge(m.status)}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            {m.status !== 'pago' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWhatsApp(m)}
                                className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                title={c?.phone ? `Enviar para ${c.phone}` : 'Sem telefone — abrir WhatsApp Web'}
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Cobrar
                              </Button>
                            )}
                            <Button size="sm" variant={m.status === 'pago' ? 'outline' : 'default'} onClick={() => togglePago(m)}>
                              {m.status === 'pago' ? 'Marcar pendente' : 'Marcar pago'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== CLIENTES (RENTABILIDADE) ===== */}
        <TabsContent value="clientes" className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr><th className="text-left p-3">Cliente</th><th className="text-right p-3">Receita</th><th className="text-right p-3">Custo Direto</th><th className="text-right p-3">Lucro</th><th className="text-left p-3 w-[35%]">Margem</th></tr>
                </thead>
                <tbody>
                  {rentabilidade.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sem dados de rentabilidade no período</td></tr>}
                  {rentabilidade.sort((a,b) => b.lucro - a.lucro).map(r => {
                    const color = r.margem >= 60 ? 'bg-emerald-500' : r.margem >= 30 ? 'bg-amber-500' : 'bg-red-500';
                    const pct = Math.max(0, Math.min(100, r.margem));
                    return (
                      <tr key={r.client.id} className="border-t border-border/50">
                        <td className="p-3 font-medium">{r.client.name}</td>
                        <td className="p-3 text-right">{fmt(r.receita)}</td>
                        <td className="p-3 text-right text-muted-foreground">{fmt(r.custo)}</td>
                        <td className={`p-3 text-right font-semibold ${r.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(r.lucro)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-mono w-14 text-right">{r.margem.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {clientesBaixaMargem.length > 0 && (
            <Card className="p-4 bg-amber-500/10 border-amber-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-300 mb-1">Atenção: clientes com margem abaixo de 20%</p>
                <ul className="space-y-1 text-amber-300/80">
                  {clientesBaixaMargem.map(r => (
                    <li key={r.client.id}>• <span className="font-medium">{r.client.name}</span> ({r.margem.toFixed(1)}%) — sugerimos reajuste de mensalidade ou redução de escopo.</li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ===== LANÇAMENTOS ===== */}
        <TabsContent value="lancamentos" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5 space-y-3 border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold"><ArrowUpCircle className="w-5 h-5" /> Nova Entrada</div>
              <div className="space-y-3">
                <div><Label className="text-xs">Descrição</Label><Input value={entrada.descricao} onChange={e => setEntrada({...entrada, descricao: e.target.value})} placeholder="Ex: Setup inicial" /></div>
                <div><Label className="text-xs">Cliente (opcional)</Label>
                  <Select value={entrada.cliente_id || 'none'} onValueChange={v => setEntrada({...entrada, cliente_id: v === 'none' ? '' : v})}>
                    <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Valor</Label><Input type="number" step="0.01" value={entrada.valor} onChange={e => setEntrada({...entrada, valor: e.target.value})} /></div>
                  <div><Label className="text-xs">Data</Label><Input type="date" value={entrada.data} onChange={e => setEntrada({...entrada, data: e.target.value})} /></div>
                </div>
                <Button onClick={addEntrada} className="w-full bg-emerald-500 hover:bg-emerald-600">Registrar entrada</Button>
              </div>
            </Card>

            <Card className="p-5 space-y-3 border-red-500/20">
              <div className="flex items-center gap-2 text-red-400 font-semibold"><ArrowDownCircle className="w-5 h-5" /> Nova Saída</div>
              <div className="space-y-3">
                <div><Label className="text-xs">Descrição</Label><Input value={saida.descricao} onChange={e => setSaida({...saida, descricao: e.target.value})} placeholder="Ex: Assinatura Notion" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Categoria</Label>
                    <Select value={saida.categoria} onValueChange={v => setSaida({...saida, categoria: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIAS_SAIDA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Vínculo</Label>
                    <Select value={saida.cliente_id || 'none'} onValueChange={v => setSaida({...saida, cliente_id: v === 'none' ? '' : v})}>
                      <SelectTrigger><SelectValue placeholder="Custo fixo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Custo fixo (sem cliente)</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Valor</Label><Input type="number" step="0.01" value={saida.valor} onChange={e => setSaida({...saida, valor: e.target.value})} /></div>
                  <div><Label className="text-xs">Data</Label><Input type="date" value={saida.data} onChange={e => setSaida({...saida, data: e.target.value})} /></div>
                </div>
                <Button onClick={addSaida} variant="destructive" className="w-full">Registrar saída</Button>
              </div>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold">Histórico do mês</h3>
              <div className="flex gap-2">
                <Select value={filtroTipo} onValueChange={(v: any) => setFiltroTipo(v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saídas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroCliente} onValueChange={setFiltroCliente}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os clientes</SelectItem>
                    <SelectItem value="sem">Sem vínculo</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Descrição</th><th className="text-left p-3">Categoria</th><th className="text-left p-3">Cliente</th><th className="text-right p-3">Valor</th></tr>
                </thead>
                <tbody>
                  {transacoesFiltradas.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum lançamento</td></tr>}
                  {transacoesFiltradas.map(t => (
                    <tr key={t.id} className="border-t border-border/50">
                      <td className="p-3 text-muted-foreground">{new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="p-3">{t.tipo === 'entrada'
                        ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Entrada</Badge>
                        : <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Saída</Badge>}</td>
                      <td className="p-3 font-medium">{t.descricao}</td>
                      <td className="p-3 text-muted-foreground">{t.categoria || '-'}</td>
                      <td className="p-3 text-muted-foreground">{clientName(t.cliente_id)}</td>
                      <td className={`p-3 text-right font-semibold ${t.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{t.tipo === 'saida' ? '−' : '+'}{fmt(Number(t.valor))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== DRE ===== */}
        <TabsContent value="dre" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileBarChart className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">DRE — {monthLabel(mes, ano)}</h2>
            </div>

            <DreSection title="Receitas" rows={[
              ['Mensalidades pagas', receitaMensalidadesPagas],
              ['Receitas avulsas', receitaAvulsa],
            ]} total={receitaBruta} totalLabel="Total de Receitas" positive />

            <DreSection title="Custos Diretos" rows={[
              ['Freelancers', saidas.filter(t => t.categoria === 'Freelancer').reduce((s,t)=>s+Number(t.valor),0)],
              ['Impulsionamento', saidas.filter(t => t.categoria === 'Impulsionamento').reduce((s,t)=>s+Number(t.valor),0)],
              ['Outros custos vinculados a cliente', saidas.filter(t => t.cliente_id && t.categoria !== 'Freelancer' && t.categoria !== 'Impulsionamento').reduce((s,t)=>s+Number(t.valor),0)],
            ]} total={custosDiretos} totalLabel="Total Custos Diretos" />

            <DreSection title="Custos Fixos" rows={CATEGORIAS_SAIDA.map(cat => [
              cat,
              saidas.filter(t => !t.cliente_id && t.categoria === cat).reduce((s,t)=>s+Number(t.valor),0)
            ] as [string, number])} total={custosFixos} totalLabel="Total Custos Fixos" />

            <div className={`mt-6 p-4 rounded-lg flex items-center justify-between ${lucroLiquido >= 0 ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-red-500/15 border border-red-500/30'}`}>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Lucro Líquido</p>
                <p className={`text-2xl font-bold ${lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(lucroLiquido)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Margem Líquida</p>
                <p className={`text-2xl font-bold ${margem >= 30 ? 'text-emerald-400' : margem >= 10 ? 'text-amber-400' : 'text-red-400'}`}>{margem.toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={exportPDF} variant="outline"><Download className="w-4 h-4 mr-2" />Exportar PDF</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && <p className="text-xs text-muted-foreground text-center">Carregando...</p>}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <Card className="p-4 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <p className={`text-lg font-bold ${accent}`}>{value}</p>
    </Card>
  );
}

function DreSection({ title, rows, total, totalLabel, positive }: { title: string; rows: [string, number][]; total: number; totalLabel: string; positive?: boolean }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2 pb-1 border-b border-border/50">{title}</h3>
      <div className="space-y-1.5">
        {rows.filter(([_, v]) => v > 0).map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm py-1">
            <span className="text-muted-foreground">{label}</span>
            <span className={positive ? 'text-emerald-400' : 'text-red-400'}>{positive ? '' : '−'}{fmt(value)}</span>
          </div>
        ))}
        {rows.every(([_, v]) => v === 0) && <p className="text-xs text-muted-foreground italic py-1">Sem lançamentos</p>}
        <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border/30">
          <span>{totalLabel}</span>
          <span className={positive ? 'text-emerald-400' : 'text-red-400'}>{positive ? '' : '−'}{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
