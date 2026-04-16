import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

const defaultObjections = [
  { objection: 'É muito caro para mim agora', response: 'Entendo que o investimento pode parecer alto. Mas vamos analisar: se o retorno é de 3x a 5x o investido, na verdade você está deixando dinheiro na mesa ao não investir. Posso te mostrar cases reais de clientes no seu nicho.' },
  { objection: 'Já tentei anúncios e não funcionou', response: 'Sinto muito pela experiência anterior. Na maioria dos casos, campanhas falham por falta de estratégia, não da ferramenta em si. Vamos analisar juntos o que foi feito e te mostro como seria diferente com uma gestão profissional.' },
  { objection: 'Preciso pensar mais', response: 'Claro, é importante tomar decisões com calma. Para te ajudar nessa análise, posso te enviar um documento com a proposta detalhada, cases do seu segmento e uma projeção de resultados. Assim você tem tudo em mãos para decidir.' },
  { objection: 'Meu sobrinho faz isso de graça', response: 'Entendo! Mas te faço uma pergunta: se você precisasse de uma cirurgia, chamaria seu sobrinho? Gestão de tráfego é uma especialidade que exige conhecimento técnico, análise de dados e experiência. O custo de uma campanha mal feita é muito maior que o investimento em um profissional.' },
];

interface Objection { id: string; objection: string; response: string; }

export default function Objecoes() {
  const { user } = useAuth();
  const [items, setItems] = useState<Objection[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Objection | null>(null);
  const [form, setForm] = useState({ objection: '', response: '' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('objections').select('*').eq('user_id', user.id).order('created_at');
    if (data && data.length > 0) {
      setItems(data);
    } else {
      await supabase.from('objections').insert(defaultObjections.map(o => ({ ...o, user_id: user.id })));
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = items.filter(i => i.objection.toLowerCase().includes(search.toLowerCase()) || i.response.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing(null); setForm({ objection: '', response: '' }); setOpen(true); };
  const openEdit = (o: Objection) => { setEditing(o); setForm({ objection: o.objection, response: o.response }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('objections').update(form).eq('id', editing.id);
    } else {
      await supabase.from('objections').insert({ ...form, user_id: user.id });
    }
    toast.success('Salvo!'); setOpen(false); load();
  };

  const remove = async (id: string) => {
    await supabase.from('objections').delete().eq('id', id);
    toast.success('Removido!'); load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">Objeções de Clientes</h1><p className="text-muted-foreground text-sm mt-1">Biblioteca de respostas a objeções</p></div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Nova Objeção</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar objeções..." className="pl-9 bg-secondary/50 border-border/50" />
      </div>
      <div className="space-y-3">
        {filtered.map(o => (
          <div key={o.id} className="glass-surface rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-foreground text-sm">"{o.objection}"</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" onClick={() => openEdit(o)}><Edit2 className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(o.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{o.response}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center py-12 text-muted-foreground">Nenhuma objeção encontrada.</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova Objeção'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Objeção</Label><Input value={form.objection} onChange={(e) => setForm({ ...form, objection: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Resposta sugerida</Label><Textarea value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={5} /></div>
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
