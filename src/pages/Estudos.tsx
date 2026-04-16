import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface CaseStudy {
  id: string; client_name: string; niche: string; challenge: string; strategy: string; results: string; learnings: string;
}

export default function Estudos() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CaseStudy | null>(null);
  const [selected, setSelected] = useState<CaseStudy | null>(null);
  const [form, setForm] = useState({ client_name: '', niche: '', challenge: '', strategy: '', results: '', learnings: '' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('case_studies').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setCases(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => { setEditing(null); setForm({ client_name: '', niche: '', challenge: '', strategy: '', results: '', learnings: '' }); setOpen(true); };
  const openEdit = (c: CaseStudy) => { setEditing(c); setForm({ client_name: c.client_name, niche: c.niche, challenge: c.challenge, strategy: c.strategy, results: c.results, learnings: c.learnings }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('case_studies').update(form).eq('id', editing.id);
      toast.success('Estudo atualizado!');
    } else {
      await supabase.from('case_studies').insert({ ...form, user_id: user.id });
      toast.success('Estudo criado!');
    }
    setOpen(false); setSelected(null); load();
  };

  const remove = async (id: string) => {
    await supabase.from('case_studies').delete().eq('id', id);
    toast.success('Removido!'); setSelected(null); load();
  };

  if (selected) return (
    <div className="animate-fade-in space-y-4">
      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
      <div className="glass-surface rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div><h2 className="text-xl font-bold text-foreground">{selected.client_name}</h2><p className="text-sm text-primary">{selected.niche}</p></div>
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => openEdit(selected)}><Edit2 className="w-3 h-3" /></Button><Button variant="ghost" size="sm" onClick={() => remove(selected.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button></div>
        </div>
        {[{ l: 'Desafio', v: selected.challenge }, { l: 'Estratégia', v: selected.strategy }, { l: 'Resultados', v: selected.results }, { l: 'Aprendizados', v: selected.learnings }].map(s => (
          <div key={s.l}><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">{s.l}</h3><p className="text-sm text-foreground whitespace-pre-line">{s.v}</p></div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Estudos de Caso</h1><p className="text-muted-foreground text-sm mt-1">Documente seus casos de sucesso</p></div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Estudo</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map(c => (
          <div key={c.id} onClick={() => setSelected(c)} className="glass-surface rounded-xl p-5 cursor-pointer hover:border-primary/30 transition-all">
            <h3 className="font-semibold text-foreground mb-1">{c.client_name}</h3>
            <p className="text-xs text-primary mb-2">{c.niche}</p>
            <p className="text-sm text-muted-foreground line-clamp-3">{c.challenge}</p>
          </div>
        ))}
        {cases.length === 0 && <p className="col-span-full text-center py-12 text-muted-foreground">Nenhum estudo de caso.</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Estudo' : 'Novo Estudo de Caso'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[{ l: 'Nome do cliente', k: 'client_name' as const, input: true }, { l: 'Nicho', k: 'niche' as const, input: true }, { l: 'Desafio', k: 'challenge' as const }, { l: 'Estratégia', k: 'strategy' as const }, { l: 'Resultados', k: 'results' as const }, { l: 'Aprendizados', k: 'learnings' as const }].map(f => (
              <div key={f.k}><Label className="text-muted-foreground text-sm">{f.l}</Label>
                {f.input ? <Input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /> : <Textarea value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={3} />}
              </div>
            ))}
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
