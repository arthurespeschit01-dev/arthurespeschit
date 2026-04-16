import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ExternalLink, Plus, Edit2, Trash2, FileText, Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const modelos = [
  { id: 1, title: 'Modelo de Contrato 1', url: 'https://www.canva.com/design/DAGKGOtZZTw/587r9CqeMz3SKK43jlgRqg/view?utm_content=DAGKGOtZZTw&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview' },
  { id: 2, title: 'Modelo de Contrato 2', url: 'https://www.canva.com/design/DAGKG82qmU4/FqH-UTlBpbe-s0ezQn-slQ/view?utm_content=DAGKG82qmU4&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview' },
  { id: 3, title: 'Modelo de Contrato 3', url: 'https://www.canva.com/design/DAGKG82rA6w/OpSGsIzQSeSN2fRZf2CMGA/view?utm_content=DAGKG82rA6w&utm_campaign=designshare&utm_medium=link&utm_source=publishsharelink&mode=preview' },
];

interface SignedContract {
  id: string;
  client_name: string;
  title: string;
  status: string;
  signed_date: string | null;
  expiry_date: string | null;
  notes: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  Ativo: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Encerrado: 'bg-muted text-muted-foreground border-border',
  Cancelado: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function Contratos() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<SignedContract[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SignedContract | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ client_name: '', title: '', status: 'Ativo', signed_date: '', expiry_date: '', notes: '' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('signed_contracts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setContracts(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ client_name: '', title: '', status: 'Ativo', signed_date: '', expiry_date: '', notes: '' });
    setOpen(true);
  };

  const openEdit = (c: SignedContract) => {
    setEditing(c);
    setForm({ client_name: c.client_name, title: c.title, status: c.status, signed_date: c.signed_date || '', expiry_date: c.expiry_date || '', notes: c.notes || '' });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.client_name.trim() || !form.title.trim()) { toast.error('Cliente e título são obrigatórios'); return; }
    const payload = {
      client_name: form.client_name.trim(), title: form.title.trim(), status: form.status,
      signed_date: form.signed_date || null, expiry_date: form.expiry_date || null, notes: form.notes.trim(),
    };
    if (editing) {
      await supabase.from('signed_contracts').update(payload).eq('id', editing.id);
      toast.success('Contrato atualizado!');
    } else {
      await supabase.from('signed_contracts').insert({ ...payload, user_id: user.id });
      toast.success('Contrato adicionado!');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('signed_contracts').delete().eq('id', id);
    toast.success('Contrato removido!');
    load();
  };

  const filtered = contracts.filter(c =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in space-y-6">
      {/* Models Section */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Modelos de Contratos</h1>
        <p className="text-muted-foreground text-sm mt-1">Templates prontos para usar com seus clientes</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modelos.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
            className="glass-surface rounded-xl p-6 flex flex-col items-center gap-4 hover:border-primary/50 transition-colors group">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">{m.id}</div>
            <h3 className="font-semibold text-foreground text-center">{m.title}</h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
              Abrir no Canva <ExternalLink className="w-3 h-3" />
            </span>
          </a>
        ))}
      </div>

      {/* Signed Contracts Section */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Contratos Assinados</h2>
            <p className="text-muted-foreground text-sm mt-1">Gerencie os contratos firmados com seus clientes</p>
          </div>
          <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Novo Contrato</Button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar contratos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>

        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="glass-surface rounded-xl p-5 border border-border/20 hover:border-primary/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{c.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${statusColors[c.status] || statusColors.Ativo}`}>{c.status}</Badge>
                  </div>
                  <p className="text-sm text-primary mt-0.5">{c.client_name}</p>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {c.signed_date && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Assinado: {new Date(c.signed_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {c.expiry_date && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Vencimento: {new Date(c.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit2 className="w-4 h-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
                        <AlertDialogDescription>O contrato "{c.title}" será removido permanentemente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum contrato assinado ainda.</p>
              <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Adicionar contrato</Button>
            </div>
          )}
        </div>
      </div>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Contrato' : 'Novo Contrato Assinado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Cliente *</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="bg-secondary/50 border-border/50" />
            </div>
            <div>
              <Label>Título do Contrato *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-secondary/50 border-border/50" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Encerrado">Encerrado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de Assinatura</Label>
                <Input type="date" value={form.signed_date} onChange={(e) => setForm({ ...form, signed_date: e.target.value })} className="bg-secondary/50 border-border/50" />
              </div>
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="bg-secondary/50 border-border/50" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="bg-secondary/50 border-border/50" />
            </div>
            <Button onClick={save} className="w-full neon-glow">{editing ? 'Salvar' : 'Adicionar Contrato'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
