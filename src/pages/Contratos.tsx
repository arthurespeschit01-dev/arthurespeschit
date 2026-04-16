import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Copy, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const defaultTemplate = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO DE TRÁFEGO PAGO

CONTRATANTE: [Nome do Cliente], inscrito no CNPJ/CPF sob o nº [número], com sede em [endereço].

CONTRATADO: [Sua Empresa], inscrito no CNPJ sob o nº [número], com sede em [endereço].

CLÁUSULA 1ª - DO OBJETO
O presente contrato tem por objeto a prestação de serviços de gestão de tráfego pago em plataformas digitais, incluindo mas não se limitando a: Facebook Ads, Google Ads, TikTok Ads e LinkedIn Ads.

CLÁUSULA 2ª - DA VIGÊNCIA
O presente contrato terá vigência de [X] meses, com início em [data] e término em [data], podendo ser renovado mediante acordo entre as partes.

CLÁUSULA 3ª - DO VALOR E PAGAMENTO
Pelos serviços prestados, o CONTRATANTE pagará ao CONTRATADO o valor mensal de R$ [valor], até o dia [X] de cada mês.

CLÁUSULA 4ª - DAS OBRIGAÇÕES DO CONTRATADO
a) Criar e gerenciar campanhas de tráfego pago;
b) Otimizar campanhas para melhor performance;
c) Enviar relatórios periódicos de resultados;
d) Participar de reuniões de alinhamento.

CLÁUSULA 5ª - DAS OBRIGAÇÕES DO CONTRATANTE
a) Fornecer acesso às plataformas necessárias;
b) Aprovar criativos e estratégias;
c) Efetuar pagamentos pontualmente;
d) Fornecer informações necessárias para as campanhas.

CLÁUSULA 6ª - DO INVESTIMENTO EM MÍDIA
O investimento em mídia (verba de anúncios) é de responsabilidade do CONTRATANTE e não está incluso no valor dos serviços.

CLÁUSULA 7ª - DA RESCISÃO
O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 dias.`;

interface Template { id: string; title: string; content: string; }

export default function Contratos() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: '', content: '' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('contract_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setTemplates(data);
    } else {
      await supabase.from('contract_templates').insert({ title: 'Contrato de Gestão de Tráfego Pago', content: defaultTemplate, user_id: user.id });
      load();
    }
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => { setEditing(null); setForm({ title: '', content: '' }); setOpen(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ title: t.title, content: t.content }); setOpen(true); };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('contract_templates').update(form).eq('id', editing.id);
    } else {
      await supabase.from('contract_templates').insert({ ...form, user_id: user.id });
    }
    toast.success('Salvo!'); setOpen(false); load();
  };

  const duplicate = async (t: Template) => {
    if (!user) return;
    await supabase.from('contract_templates').insert({ title: t.title + ' (cópia)', content: t.content, user_id: user.id });
    toast.success('Duplicado!'); load();
  };

  const remove = async (id: string) => {
    await supabase.from('contract_templates').delete().eq('id', id);
    toast.success('Removido!'); load();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">Modelos de Contrato</h1><p className="text-muted-foreground text-sm mt-1">Templates prontos para usar</p></div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Modelo</Button>
      </div>
      <div className="space-y-4">
        {templates.map(t => (
          <div key={t.id} className="glass-surface rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-foreground">{t.title}</h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => duplicate(t)}><Copy className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-3 h-3" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(t.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">{t.content}</pre>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Conteúdo</Label><Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="bg-secondary/50 border-border/50 mt-1 font-mono text-xs" rows={20} /></div>
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
