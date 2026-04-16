import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Users, DollarSign, BarChart3, TrendingUp } from 'lucide-react';

interface Stats {
  totalClients: number;
  activeClients: number;
  totalCampaigns: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalClients: 0, activeClients: 0, totalCampaigns: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count: total } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      const { count: active } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'Ativo');
      const { count: campaigns } = await supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      setStats({ totalClients: total || 0, activeClients: active || 0, totalCampaigns: campaigns || 0 });
    };
    load();
  }, [user]);

  const cards = [
    { label: 'Total de Clientes', value: stats.totalClients, icon: Users, color: 'text-neon-purple' },
    { label: 'Clientes Ativos', value: stats.activeClients, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Campanhas', value: stats.totalCampaigns, icon: BarChart3, color: 'text-neon-blue' },
    { label: 'Taxa de Retenção', value: stats.totalClients > 0 ? Math.round((stats.activeClients / stats.totalClients) * 100) + '%' : '0%', icon: DollarSign, color: 'text-amber-400' },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do seu negócio</p>
      </div>

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

      <div className="glass-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Bem-vindo ao Gestor Pro</h2>
        <p className="text-muted-foreground text-sm">
          Use o menu lateral para navegar entre as seções. Comece cadastrando seus clientes e campanhas.
        </p>
      </div>
    </div>
  );
}
