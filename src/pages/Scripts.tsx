import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const defaultScripts = [
  { scenario: 'Cliente indeciso', content: 'Entendo sua hesitação. Vamos fazer o seguinte: eu preparo uma análise gratuita do seu mercado e em 48h te mostro exatamente o potencial de retorno. Sem compromisso. Se fizer sentido, seguimos. O que acha?' },
  { scenario: 'Objeção de preço', content: 'Entendo que investimento é uma decisão importante. Mas pensa comigo: quanto você está perdendo por mês sem um tráfego qualificado? Se com R$ X de investimento eu trouxer Y clientes a mais, o valor se paga no primeiro mês.' },
  { scenario: 'Comparando com concorrente', content: 'Legal que você está pesquisando! Isso mostra que leva a sério. O que nos diferencia é [diferencial]. Além disso, trabalhamos com contrato de performance — se não entregar resultado, você não continua.' },
  { scenario: 'Não é o momento', content: 'Entendo perfeitamente. Mas deixa eu te fazer uma pergunta: se seus concorrentes estão investindo agora, quanto mercado você perde a cada mês que espera? Posso montar um plano que começa pequeno e escala conforme os resultados.' },
];

interface Script { id: string; scenario: string; content: string; }

export default function Scripts() {
  const { user } = useAuth();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [form, setForm] = useState({ scenario: '', content: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('closing_scripts').select('*').eq('user_id', user.id).order('created_at');
    if (data && data.length > 0) {
      setScripts(data);
    } else {
      await supabase.from('closing_scripts').insert(defaultScripts.map(s => ({ ...s, user_id: user.id })));
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => { setEditing(null); setForm({ scenario: '', content: '' }); setOpen(true); };
  const openEdit = (s: Script) => { setEditing(s); setForm({ scenario: s.scenario, content: s.content }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('closing_scripts').update(form).eq('id', editing.id);
    } else {
      await supabase.from('closing_scripts').insert({ ...form, user_id: user.id });
    }
    toast.success('Salvo!'); setOpen(false); load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Scripts de Fechamento</h1><p className="text-muted-foreground text-sm mt-1">Argumentos de venda por cenário</p></div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Script</Button>
      </div>
      <div className="space-y-3">
        {scripts.map(s => (
          <div key={s.id} className="glass-surface rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="w-full flex items-center justify-between p-4 text-left">
              <span className="font-medium text-foreground text-sm">{s.scenario}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }}><Edit2 className="w-3 h-3" /></Button>
                {expanded === s.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {expanded === s.id && (
              <div className="px-4 pb-4 border-t border-border/50 pt-3">
                <p className="text-sm text-muted-foreground whitespace-pre-line">{s.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? 'Editar Script' : 'Novo Script'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Cenário</Label><Input value={form.scenario} onChange={(e) => setForm({ ...form, scenario: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Script</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={6} /></div>
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
