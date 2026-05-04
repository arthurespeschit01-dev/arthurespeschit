import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users, DollarSign, TrendingUp, Wallet, Percent, AlertTriangle,
  Clock, CheckCircle2, XCircle, AlertCircle, FileText, MessageCircle,
  CalendarClock, ArrowUpRight, Trophy
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import CobrancaDialog from '@/components/CobrancaDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccountBalancesCount, getBalanceStatus } from '@/components/AccountBalancesPanel';

const CUSTOS_DIRETOS = new Set(['Tráfego', 'Anúncios', 'Ferramentas Cliente', 'Freelancer Cliente']);

interface Client {
  id: string;
  name: string;
  status: string | null;
  monthly_fee: number | null;
  payment_day: number | null;
  phone: string | null;
}
interface Mensalidade {
  id: string;
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: string;
}
interface Transacao {
  id: string;
  tipo: string;
  valor: number;
  cliente_id: string | null;
  categoria: string | null;
  data: string;
}
interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  end_date: string | null;
}
interface ContratoVenc {
  id: string;
  title: string;
  client_name: string;
  expiry_date: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = new Date();
  const [mes, setMes] = useState(today.getMonth());
  const [ano, setAno] = useState(today.getFullYear());

  const [clients, setClients] = useState<Client[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [contratos, setContratos] = useState<ContratoVenc[]>([]);
  const [revenueHistory, setRevenueHistory] = useState<{ month: string; revenue: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const inicioMes = new Date(ano, mes, 1).toISOString().slice(0, 10);
      const fimMes = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
      const inicio6Meses = new Date(ano, mes - 5, 1).toISOString().slice(0, 10);

      const [clientsRes, mensRes, transRes, tasksRes, contratosRes, transHistRes, mensHistRes] = await Promise.all([
        supabase.from('clients').select('id, name, status, monthly_fee, payment_day, phone').eq('user_id', user.id),
        supabase.from('mensalidades').select('*').eq('user_id', user.id).gte('vencimento', inicioMes).lte('vencimento', fimMes),
        supabase.from('transacoes').select('*').eq('user_id', user.id).gte('data', inicioMes).lte('data', fimMes),
        supabase.from('operational_tasks').select('id, title, status, priority, end_date').eq('user_id', user.id).neq('status', 'concluída').order('end_date', { ascending: true, nullsFirst: false }).limit(6),
        supabase.from('signed_contracts').select('id, title, client_name, expiry_date').eq('user_id', user.id).not('expiry_date', 'is', null).order('expiry_date', { ascending: true }),
        supabase.from('transacoes').select('tipo, valor, data').eq('user_id', user.id).gte('data', inicio6Meses),
        supabase.from('mensalidades').select('valor, status, vencimento').eq('user_id', user.id).gte('vencimento', inicio6Meses),
      ]);

      setClients((clientsRes.data || []) as Client[]);
      setMensalidades((mensRes.data || []) as Mensalidade[]);
      setTransacoes((transRes.data || []) as Transacao[]);
      setTasks((tasksRes.data || []) as TaskItem[]);

      // Contratos a vencer (próximos 60 dias) - sempre baseado em hoje
      const hojeReal = new Date();
      const limite = new Date(); limite.setDate(limite.getDate() + 60);
      const hojeStr = hojeReal.toISOString().slice(0, 10);
      const limStr = limite.toISOString().slice(0, 10);
      setContratos(((contratosRes.data || []) as ContratoVenc[]).filter(c => c.expiry_date >= hojeStr && c.expiry_date <= limStr).slice(0, 5));

      // Histórico 6 meses (receita = mensalidades pagas + entradas avulsas)
      const map: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(ano, mes - i, 1);
        map[d.toISOString().slice(0, 7)] = 0;
      }
      ((mensHistRes.data || []) as { valor: number; status: string; vencimento: string }[]).forEach(m => {
        if (m.status === 'pago') {
          const k = m.vencimento.slice(0, 7);
          if (k in map) map[k] += Number(m.valor);
        }
      });
      ((transHistRes.data || []) as { tipo: string; valor: number; data: string }[]).forEach(t => {
        if (t.tipo === 'entrada') {
          const k = t.data.slice(0, 7);
          if (k in map) map[k] += Number(t.valor);
        }
      });
      setRevenueHistory(Object.entries(map).map(([k, v]) => {
        const [y, mo] = k.split('-');
        const d = new Date(Number(y), Number(mo) - 1, 1);
        return { month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), revenue: v };
      }));
    };
    load();
  }, [user, mes, ano]);

  // ===== Cálculos financeiros (mês atual) =====
  const fin = useMemo(() => {
    const recMens = mensalidades.filter(m => m.status === 'pago').reduce((s, m) => s + Number(m.valor), 0);
    const recAvulsa = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
    const receita = recMens + recAvulsa;
    const saidas = transacoes.filter(t => t.tipo === 'saida');
    const custosDiretos = saidas.filter(t => t.cliente_id || (t.categoria && CUSTOS_DIRETOS.has(t.categoria))).reduce((s, t) => s + Number(t.valor), 0);
    const custosFixos = saidas.filter(t => !t.cliente_id && (!t.categoria || !CUSTOS_DIRETOS.has(t.categoria))).reduce((s, t) => s + Number(t.valor), 0);
    const lucro = receita - custosDiretos - custosFixos;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;
    const aReceber = mensalidades.filter(m => m.status !== 'pago').reduce((s, m) => s + Number(m.valor), 0);
    const atrasadas = mensalidades.filter(m => m.status === 'atrasado');
    const totalAtrasado = atrasadas.reduce((s, m) => s + Number(m.valor), 0);
    return { receita, lucro, margem, aReceber, totalAtrasado, atrasadasCount: atrasadas.length };
  }, [mensalidades, transacoes]);

  // ===== Visão de clientes =====
  const totalClientes = clients.length;
  const clientesAtivos = clients.filter(c => c.status === 'Ativo').length;
  const clientesPausados = clients.filter(c => c.status === 'Pausado').length;

  const rentabilidade = useMemo(() => {
    return clients.map(c => {
      const recM = mensalidades.filter(m => m.cliente_id === c.id && m.status === 'pago').reduce((s, m) => s + Number(m.valor), 0);
      const recA = transacoes.filter(t => t.tipo === 'entrada' && t.cliente_id === c.id).reduce((s, t) => s + Number(t.valor), 0);
      const receita = recM + recA;
      const custo = transacoes.filter(t => t.tipo === 'saida' && t.cliente_id === c.id).reduce((s, t) => s + Number(t.valor), 0);
      const lucro = receita - custo;
      const margem = receita > 0 ? (lucro / receita) * 100 : 0;
      return { client: c, receita, lucro, margem };
    });
  }, [clients, mensalidades, transacoes]);

  const top3 = useMemo(() => [...rentabilidade].filter(r => r.receita > 0).sort((a, b) => b.receita - a.receita).slice(0, 3), [rentabilidade]);
  const baixaMargem = useMemo(() => rentabilidade.filter(r => r.receita > 0 && r.margem < 20), [rentabilidade]);

  // ===== Próximos eventos =====
  const proximasMensalidades = useMemo(() => {
    const hojeStr = new Date().toISOString().slice(0, 10);
    return mensalidades
      .filter(m => m.status !== 'pago')
      .map(m => ({ ...m, cliente: clients.find(c => c.id === m.cliente_id) }))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .slice(0, 5);
  }, [mensalidades, clients]);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR');

  const [cobrancaOpen, setCobrancaOpen] = useState(false);
  const [cobrancaData, setCobrancaData] = useState<{ name: string; valor: number; vencimento: string }>({ name: '', valor: 0, vencimento: '' });
  const abrirCobranca = (clienteName: string, valor: number, vencimento: string) => {
    setCobrancaData({ name: clienteName, valor, vencimento });
    setCobrancaOpen(true);
  };

  const statusIcon = (s: string) => {
    if (s === 'pendente') return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    if (s === 'em andamento') return <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--neon-blue))]" />;
    if (s === 'concluída') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  };

  const diasAteVenc = (d: string) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dt = new Date(d + 'T00:00');
    return Math.ceil((dt.getTime() - hoje.getTime()) / 86400000);
  };

  const meses = Array.from({ length: 12 }, (_, i) => i);
  const anos = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral do seu negócio</p>
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

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Receita do mês" value={fmt(fin.receita)} accent="text-amber-400" />
        <KpiCard icon={Wallet} label="Lucro Líquido" value={fmt(fin.lucro)} accent={fin.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <KpiCard icon={Percent} label="Margem" value={`${fin.margem.toFixed(1)}%`} accent={fin.margem >= 30 ? 'text-emerald-400' : fin.margem >= 10 ? 'text-amber-400' : 'text-red-400'} />
        <KpiCard
          icon={AlertTriangle}
          label="A receber / Atrasado"
          value={fmt(fin.aReceber)}
          sub={fin.totalAtrasado > 0 ? `${fin.atrasadasCount} atrasada(s) — ${fmt(fin.totalAtrasado)}` : 'Sem atrasados'}
          accent={fin.totalAtrasado > 0 ? 'text-red-400' : 'text-emerald-400'}
          onClick={() => navigate('/financeiro')}
        />
      </div>

      {/* KPIs de clientes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total de Clientes" value={String(totalClientes)} accent="text-[hsl(var(--neon-purple))]" />
        <KpiCard icon={TrendingUp} label="Ativos" value={String(clientesAtivos)} accent="text-emerald-400" />
        <KpiCard icon={Clock} label="Pausados" value={String(clientesPausados)} accent="text-amber-400" />
        <KpiCard icon={AlertTriangle} label="Margem baixa (<20%)" value={String(baixaMargem.length)} accent={baixaMargem.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      {/* Gráfico de evolução */}
      <div className="glass-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Evolução da receita (últimos 6 meses)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueHistory}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 12%)" />
              <XAxis dataKey="month" stroke="hsl(220, 10%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(220, 10%, 55%)" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(232, 25%, 7%)', border: '1px solid hsl(220, 10%, 12%)', borderRadius: '8px', color: 'hsl(220, 20%, 92%)' }}
                formatter={(value: number) => [fmt(value), 'Receita']}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(263, 70%, 58%)" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 3 clientes */}
        <div className="glass-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Top 3 clientes por receita</h2>
            <button onClick={() => navigate('/clientes')} className="text-xs text-primary hover:underline">Ver todos</button>
          </div>
          {top3.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem receita registrada ainda</p>
          ) : (
            <div className="space-y-3">
              {top3.map((r, i) => (
                <div key={r.client.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 cursor-pointer transition-colors" onClick={() => navigate(`/clientes/${r.client.id}`)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-amber-400/20 text-amber-400' : i === 1 ? 'bg-zinc-400/20 text-zinc-300' : 'bg-orange-700/20 text-orange-400'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.client.name}</p>
                    <p className="text-xs text-muted-foreground">Margem {r.margem.toFixed(1)}%</p>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400">{fmt(r.receita)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes baixa margem */}
        <div className="glass-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Alerta: margem baixa</h2>
            <button onClick={() => navigate('/financeiro')} className="text-xs text-primary hover:underline">Análise completa</button>
          </div>
          {baixaMargem.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente abaixo de 20% de margem 🎉</p>
          ) : (
            <div className="space-y-2">
              {baixaMargem.slice(0, 5).map(r => (
                <div key={r.client.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                  <span className="text-sm text-foreground flex-1 truncate">{r.client.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono">{r.margem.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximas mensalidades */}
        <div className="glass-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><CalendarClock className="w-4 h-4 text-[hsl(var(--neon-blue))]" /> Próximas mensalidades</h2>
            <button onClick={() => navigate('/financeiro')} className="text-xs text-primary hover:underline">Financeiro</button>
          </div>
          {proximasMensalidades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensalidade pendente</p>
          ) : (
            <div className="space-y-2">
              {proximasMensalidades.map(m => {
                const dias = diasAteVenc(m.vencimento);
                const atrasada = m.status === 'atrasado';
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.cliente?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(m.vencimento)} · {atrasada ? <span className="text-red-400">Atrasada {Math.abs(dias)}d</span> : dias === 0 ? <span className="text-amber-400">Vence hoje</span> : <span>Em {dias}d</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{fmt(Number(m.valor))}</span>
                    <button
                      onClick={() => abrirCobranca(m.cliente?.name || 'Cliente', Number(m.valor), m.vencimento)}
                      className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                      title="Gerar mensagem de cobrança"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contratos a vencer */}
        <div className="glass-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-[hsl(var(--neon-purple))]" /> Contratos a vencer (60d)</h2>
            <button onClick={() => navigate('/contratos')} className="text-xs text-primary hover:underline">Ver todos</button>
          </div>
          {contratos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum contrato vencendo nos próximos 60 dias</p>
          ) : (
            <div className="space-y-2">
              {contratos.map(c => {
                const dias = diasAteVenc(c.expiry_date);
                return (
                  <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 cursor-pointer transition-colors" onClick={() => navigate('/contratos')}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.client_name} · {fmtDate(c.expiry_date)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${dias <= 7 ? 'bg-red-500/20 text-red-400' : dias <= 30 ? 'bg-amber-400/20 text-amber-400' : 'bg-secondary text-muted-foreground'}`}>
                      {dias}d
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tasks em andamento */}
      <div className="glass-surface rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Integrações em andamento</h2>
          <button onClick={() => navigate('/tasks')} className="text-xs text-primary hover:underline flex items-center gap-1">Ver todas <ArrowUpRight className="w-3 h-3" /></button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma task pendente 🎉</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => navigate('/tasks')}>
                {statusIcon(t.status)}
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                {t.end_date && <span className="text-xs text-muted-foreground">{fmtDate(t.end_date)}</span>}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  t.priority === 'alta' ? 'bg-destructive/20 text-destructive' :
                  t.priority === 'média' ? 'bg-amber-400/20 text-amber-400' :
                  'bg-muted text-muted-foreground'
                }`}>{t.priority}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <CobrancaDialog
        open={cobrancaOpen}
        onOpenChange={setCobrancaOpen}
        clienteName={cobrancaData.name}
        valor={cobrancaData.valor}
        vencimento={cobrancaData.vencimento}
      />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`glass-surface rounded-xl p-5 transition-colors ${onClick ? 'cursor-pointer hover:border-primary/40' : 'hover:border-primary/20'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${accent} break-words leading-tight`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 break-words">{sub}</div>}
    </div>
  );
}
