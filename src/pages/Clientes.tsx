import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  services: string;
  monthly_fee: number;
  contract_duration: string;
  status: string;
}

export default function Clientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setClients(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo' });
    setOpen(true);
  };

  const openEdit = (c: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(c);
    setForm({ name: c.name, services: c.services, monthly_fee: c.monthly_fee, contract_duration: c.contract_duration, status: c.status });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (editing) {
      await supabase.from('clients').update({ ...form }).eq('id', editing.id);
      toast.success('Cliente atualizado!');
    } else {
      await supabase.from('clients').insert({ ...form, user_id: user.id });
      toast.success('Cliente criado!');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('clients').delete().eq('id', id);
    toast.success('Cliente removido!');
    load();
  };

  const statusColor = (s: string) => {
    if (s === 'Ativo') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'Pausado') return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie seus clientes</p>
        </div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Cliente</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((c) => (
          <div key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} className="glass-surface rounded-xl p-5 cursor-pointer hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-foreground">{c.name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.services}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-primary font-medium">R$ {c.monthly_fee?.toLocaleString('pt-BR')}/mês</span>
              <span className="text-muted-foreground">{c.contract_duration}</span>
            </div>
            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={(e) => openEdit(c, e)}><Edit2 className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" onClick={(e) => remove(c.id, e)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-muted-foreground text-sm">Nome do cliente</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div><Label className="text-muted-foreground text-sm">Serviços</Label><Textarea value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-muted-foreground text-sm">Valor mensal (R$)</Label><Input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Duração</Label><Input value={form.contract_duration} onChange={(e) => setForm({ ...form, contract_duration: e.target.value })} placeholder="6 meses" className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Pausado">Pausado</SelectItem>
                  <SelectItem value="Encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
