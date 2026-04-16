import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, DollarSign, BarChart3, TrendingUp, ListTodo, Clock, CheckCircle2, XCircle, AlertCircle, UserPlus, Megaphone, FileText } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';

interface Stats {
  totalClients: number;
  activeClients: number;
  totalCampaigns: number;
  totalRevenue: number;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  end_date: string | null;
  client_name?: string;
}

interface ActivityItem {
  id: string;
  type: 'client' | 'campaign' | 'task';
  title: string;
  date: string;
}

interface RevenuePoint {
  month: string;
  revenue: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ totalClients: 0, activeClients: 0, totalCampaigns: 0, totalRevenue: 0 });
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [taskStats, setTaskStats] = useState({ pending: 0, inProgress: 0, done: 0, cancelled: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Stats
      const [clientsRes, activeRes, campaignsRes, feeRes] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'Ativo'),
        supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('clients').select('monthly_fee').eq('user_id', user.id).eq('status', 'Ativo'),
      ]);

      const totalRevenue = (feeRes.data || []).reduce((sum, c) => sum + (c.monthly_fee || 0), 0);

      setStats({
        totalClients: clientsRes.count || 0,
        activeClients: activeRes.count || 0,
        totalCampaigns: campaignsRes.count || 0,
        totalRevenue,
      });

      // Revenue by month (from clients created_at)
      const { data: allClients } = await supabase
        .from('clients')
        .select('monthly_fee, created_at, status')
        .eq('user_id', user.id)
        .eq('status', 'Ativo');

      const monthMap: Record<string, number> = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        monthMap[key] = 0;
      }

      (allClients || []).forEach(c => {
        const created = new Date(c.created_at);
        Object.keys(monthMap).forEach((key, idx) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
          if (created <= new Date(d.getFullYear(), d.getMonth() + 1, 0)) {
            monthMap[key] += c.monthly_fee || 0;
          }
        });
      });

      setRevenueData(Object.entries(monthMap).map(([month, revenue]) => ({ month, revenue })));

      // Tasks
      const { data: tasks } = await supabase
        .from('operational_tasks')
        .select('id, title, status, priority, end_date, client_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentTasks((tasks || []).map(t => ({ ...t, status: t.status, priority: t.priority, end_date: t.end_date })));

      // Task stats
      const { data: allTasks } = await supabase
        .from('operational_tasks')
        .select('status')
        .eq('user_id', user.id);

      const ts = { pending: 0, inProgress: 0, done: 0, cancelled: 0 };
      (allTasks || []).forEach(t => {
        if (t.status === 'pendente') ts.pending++;
        else if (t.status === 'em andamento') ts.inProgress++;
        else if (t.status === 'concluída') ts.done++;
        else if (t.status === 'cancelada') ts.cancelled++;
      });
      setTaskStats(ts);

      // Activity timeline
      const [{ data: recentClients }, { data: recentCampaigns }, { data: recentTasksAll }] = await Promise.all([
        supabase.from('clients').select('id, name, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('campaigns').select('id, name, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('operational_tasks').select('id, title, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ]);

      const acts: ActivityItem[] = [
        ...(recentClients || []).map(c => ({ id: c.id, type: 'client' as const, title: `Cliente "${c.name}" adicionado`, date: c.created_at })),
        ...(recentCampaigns || []).map(c => ({ id: c.id, type: 'campaign' as const, title: `Campanha "${c.name}" criada`, date: c.created_at })),
        ...(recentTasksAll || []).map(t => ({ id: t.id, type: 'task' as const, title: `Task "${t.title}" criada`, date: t.created_at })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

      setActivities(acts);
    };
    load();
  }, [user]);

  const cards = [
    { label: 'Total de Clientes', value: stats.totalClients, icon: Users, color: 'text-[hsl(var(--neon-purple))]' },
    { label: 'Clientes Ativos', value: stats.activeClients, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Campanhas', value: stats.totalCampaigns, icon: BarChart3, color: 'text-[hsl(var(--neon-blue))]' },
    { label: 'Receita Mensal', value: `R$ ${stats.totalRevenue.toLocaleString('pt-BR')}`, icon: DollarSign, color: 'text-amber-400' },
  ];

  const statusIcon = (s: string) => {
    if (s === 'pendente') return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    if (s === 'em andamento') return <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--neon-blue))]" />;
    if (s === 'concluída') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  };

  const activityIcon = (type: string) => {
    if (type === 'client') return <UserPlus className="w-4 h-4 text-[hsl(var(--neon-purple))]" />;
    if (type === 'campaign') return <Megaphone className="w-4 h-4 text-[hsl(var(--neon-blue))]" />;
    return <FileText className="w-4 h-4 text-emerald-400" />;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu negócio</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="glass-surface rounded-xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div className="glass-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Receita Mensal Recorrente</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(263, 70%, 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 12%)" />
              <XAxis dataKey="month" stroke="hsl(220, 10%, 55%)" fontSize={12} />
              <YAxis stroke="hsl(220, 10%, 55%)" fontSize={12} tickFormatter={(v) => `R$${v.toLocaleString('pt-BR')}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(232, 25%, 7%)', border: '1px solid hsl(220, 10%, 12%)', borderRadius: '8px', color: 'hsl(220, 20%, 92%)' }}
                formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Receita']}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(263, 70%, 58%)" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="glass-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Tasks Recentes</h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-primary hover:underline">Ver todas</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-amber-400/10 p-2.5 text-center">
              <div className="text-lg font-bold text-amber-400">{taskStats.pending}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Pendentes</div>
            </div>
            <div className="rounded-lg bg-[hsl(var(--neon-blue))]/10 p-2.5 text-center">
              <div className="text-lg font-bold text-[hsl(var(--neon-blue))]">{taskStats.inProgress}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Em Andamento</div>
            </div>
            <div className="rounded-lg bg-emerald-400/10 p-2.5 text-center">
              <div className="text-lg font-bold text-emerald-400">{taskStats.done}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Concluídas</div>
            </div>
            <div className="rounded-lg bg-destructive/10 p-2.5 text-center">
              <div className="text-lg font-bold text-destructive">{taskStats.cancelled}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Canceladas</div>
            </div>
          </div>

          <div className="space-y-2">
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma task ainda</p>
            ) : (
              recentTasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => navigate('/tasks')}>
                  {statusIcon(t.status)}
                  <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    t.priority === 'alta' ? 'bg-destructive/20 text-destructive' :
                    t.priority === 'média' ? 'bg-amber-400/20 text-amber-400' :
                    'bg-muted text-muted-foreground'
                  }`}>{t.priority}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="glass-surface rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Atividade Recente</h2>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade ainda</p>
            ) : (
              activities.map((a, i) => (
                <div key={`${a.id}-${i}`} className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {activityIcon(a.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
