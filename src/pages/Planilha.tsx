import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Client { id: string; name: string; }
interface ResultRow {
  id: string; client_id: string; period: string; investment: number; revenue: number;
  roas: number; leads: number; cpa: number; notes: string;
}

export default function Planilha() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [rows, setRows] = useState<ResultRow[]>([]);

  const loadClients = async () => {
    if (!user) return;
    const { data } = await supabase.from('clients').select('id, name').eq('user_id', user.id);
    setClients(data || []);
  };

  const loadRows = async () => {
    if (!selectedClient) return;
    const { data } = await supabase.from('result_rows').select('*').eq('client_id', selectedClient).order('created_at');
    setRows(data || []);
  };

  useEffect(() => { loadClients(); }, [user]);
  useEffect(() => { loadRows(); }, [selectedClient]);

  const addRow = async () => {
    if (!user || !selectedClient) return;
    await supabase.from('result_rows').insert({ client_id: selectedClient, user_id: user.id, period: '', investment: 0, revenue: 0, roas: 0, leads: 0, cpa: 0, notes: '' });
    loadRows();
  };

  const updateRow = async (id: string, field: string, value: string | number) => {
    await supabase.from('result_rows').update({ [field]: value }).eq('id', id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const deleteRow = async (id: string) => {
    await supabase.from('result_rows').delete().eq('id', id);
    toast.success('Linha removida!');
    loadRows();
  };

  const totals = rows.reduce((acc, r) => ({
    investment: acc.investment + (r.investment || 0),
    revenue: acc.revenue + (r.revenue || 0),
    leads: acc.leads + (r.leads || 0),
    cpa: 0, roas: 0,
  }), { investment: 0, revenue: 0, leads: 0, cpa: 0, roas: 0 });
  totals.roas = totals.investment > 0 ? totals.revenue / totals.investment : 0;
  totals.cpa = totals.leads > 0 ? totals.investment / totals.leads : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Planilha de Resultados</h1><p className="text-muted-foreground text-sm mt-1">Acompanhamento de performance por cliente</p></div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-64 bg-secondary/50 border-border/50"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedClient && <Button onClick={addRow} className="neon-glow gap-2" size="sm"><Plus className="w-3 h-3" /> Adicionar Linha</Button>}
      </div>

      {selectedClient && (
        <div className="glass-surface rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                {['Período', 'Investimento (R$)', 'Faturamento (R$)', 'ROAS', 'Leads', 'CPA (R$)', 'Observações', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-surface-hover/30">
                  <td className="px-3 py-2"><input value={r.period} onChange={(e) => updateRow(r.id, 'period', e.target.value)} className="bg-transparent text-foreground text-sm w-24 focus:outline-none" placeholder="Sem 1" /></td>
                  <td className="px-3 py-2"><input type="number" value={r.investment} onChange={(e) => updateRow(r.id, 'investment', Number(e.target.value))} className="bg-transparent text-foreground text-sm w-24 focus:outline-none" /></td>
                  <td className="px-3 py-2"><input type="number" value={r.revenue} onChange={(e) => updateRow(r.id, 'revenue', Number(e.target.value))} className="bg-transparent text-foreground text-sm w-24 focus:outline-none" /></td>
                  <td className="px-3 py-2"><input type="number" step="0.1" value={r.roas} onChange={(e) => updateRow(r.id, 'roas', Number(e.target.value))} className="bg-transparent text-foreground text-sm w-16 focus:outline-none" /></td>
                  <td className="px-3 py-2"><input type="number" value={r.leads} onChange={(e) => updateRow(r.id, 'leads', Number(e.target.value))} className="bg-transparent text-foreground text-sm w-16 focus:outline-none" /></td>
                  <td className="px-3 py-2"><input type="number" value={r.cpa} onChange={(e) => updateRow(r.id, 'cpa', Number(e.target.value))} className="bg-transparent text-foreground text-sm w-20 focus:outline-none" /></td>
                  <td className="px-3 py-2"><input value={r.notes} onChange={(e) => updateRow(r.id, 'notes', e.target.value)} className="bg-transparent text-foreground text-sm w-32 focus:outline-none" placeholder="..." /></td>
                  <td className="px-3 py-2"><button onClick={() => deleteRow(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-primary/5 font-semibold">
                  <td className="px-3 py-3 text-xs text-primary">TOTAIS</td>
                  <td className="px-3 py-3 text-xs text-foreground">R$ {totals.investment.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-3 text-xs text-foreground">R$ {totals.revenue.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-3 text-xs text-foreground">{totals.roas.toFixed(2)}x</td>
                  <td className="px-3 py-3 text-xs text-foreground">{totals.leads}</td>
                  <td className="px-3 py-3 text-xs text-foreground">R$ {totals.cpa.toFixed(2)}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Adicione linhas para acompanhar resultados.</p>}
        </div>
      )}

      {!selectedClient && <div className="glass-surface rounded-xl p-12 text-center text-muted-foreground">Selecione um cliente para ver os resultados.</div>}
    </div>
  );
}
