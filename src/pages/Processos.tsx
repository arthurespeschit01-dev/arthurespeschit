import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const defaultSteps = [
  'Briefing inicial com o cliente',
  'Coleta de acessos às plataformas (Facebook, Google, etc.)',
  'Configuração de Pixel e Tags de conversão',
  'Análise de mercado e concorrência',
  'Criação de estratégia de campanha',
  'Configuração das campanhas nas plataformas',
  'Reunião de alinhamento com o cliente',
  'Lançamento das campanhas',
  'Monitoramento e otimização inicial (primeiros 7 dias)',
  'Relatório semanal de resultados',
];

interface Step { id: string; title: string; position: number; }

export default function Processos() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('onboarding_steps').select('*').eq('user_id', user.id).order('position');
    if (data && data.length > 0) {
      setSteps(data);
    } else {
      // Seed defaults
      const inserts = defaultSteps.map((t, i) => ({ title: t, position: i, user_id: user.id }));
      await supabase.from('onboarding_steps').insert(inserts);
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const startEdit = (s: Step) => { setEditingId(s.id); setEditText(s.title); };
  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from('onboarding_steps').update({ title: editText }).eq('id', editingId);
    setEditingId(null);
    toast.success('Etapa atualizada!');
    load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Processos de Entrada de Clientes</h1>
        <p className="text-muted-foreground text-sm mt-1">Checklist de onboarding</p>
      </div>

      <div className="glass-surface rounded-xl p-6">
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-primary/20" />
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-start gap-4 relative">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 z-10">
                  {i + 1}
                </div>
                {editingId === s.id ? (
                  <div className="flex-1 flex gap-2 items-center">
                    <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="bg-secondary/50 border-border/50" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
                    <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="w-4 h-4 text-emerald-400" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-between group py-1.5">
                    <span className="text-sm text-foreground">{s.title}</span>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)} className="opacity-0 group-hover:opacity-100"><Edit2 className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
