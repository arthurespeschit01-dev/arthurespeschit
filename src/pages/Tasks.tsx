import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Search, Calendar, Paperclip, Trash2, Edit2,
  CheckCircle2, Clock, AlertCircle, Upload, X, FileText, ExternalLink, XCircle
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  client_id: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

interface Attachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock },
  'em andamento': { label: 'Em Andamento', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: AlertCircle },
  concluída: { label: 'Concluída', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  cancelada: { label: 'Cancelada', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground border-border' },
  média: { label: 'Média', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  alta: { label: 'Alta', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', status: 'pendente', priority: 'média',
    start_date: '', end_date: '', client_id: '',
  });

  const load = async () => {
    if (!user) return;
    const [tasksRes, clientsRes, attachRes] = await Promise.all([
      supabase.from('operational_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('task_attachments').select('*').eq('user_id', user.id),
    ]);
    setTasks(tasksRes.data || []);
    setClients(clientsRes.data || []);
    setAttachments(attachRes.data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', description: '', status: 'pendente', priority: 'média', start_date: '', end_date: '', client_id: '' });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      start_date: t.start_date || '',
      end_date: t.end_date || '',
      client_id: t.client_id || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.title.trim()) { toast.error('Título é obrigatório'); return; }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      client_id: form.client_id || null,
    };
    if (editing) {
      await supabase.from('operational_tasks').update(payload).eq('id', editing.id);
      toast.success('Task atualizada!');
    } else {
      await supabase.from('operational_tasks').insert({ ...payload, user_id: user.id });
      toast.success('Task criada!');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('operational_tasks').delete().eq('id', id);
    toast.success('Task removida!');
    load();
  };

  const changeStatus = async (t: Task, newStatus: string) => {
    await supabase.from('operational_tasks').update({ status: newStatus }).eq('id', t.id);
    load();
  };

  const handleFileUpload = async (taskId: string, file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${taskId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('task-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('task-attachments').getPublicUrl(filePath);
      await supabase.from('task_attachments').insert({
        task_id: taskId, user_id: user.id, file_name: file.name, file_url: urlData.publicUrl,
      });
      toast.success('Anexo adicionado!');
      load();
    } catch (err) {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: Attachment) => {
    await supabase.from('task_attachments').delete().eq('id', att.id);
    toast.success('Anexo removido!');
    load();
  };

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'todos' || t.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [tasks, search, filterStatus]);

  const getClientName = (clientId: string | null) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId)?.name || null;
  };

  const getTaskAttachments = (taskId: string) => attachments.filter(a => a.task_id === taskId);

  const counts = useMemo(() => ({
    pendente: tasks.filter(t => t.status === 'pendente').length,
    'em andamento': tasks.filter(t => t.status === 'em andamento').length,
    concluída: tasks.filter(t => t.status === 'concluída').length,
    cancelada: tasks.filter(t => t.status === 'cancelada').length,
  }), [tasks]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks Operacionais</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize suas tarefas e acompanhe o progresso</p>
        </div>
        <Button onClick={openNew} className="neon-glow gap-2"><Plus className="w-4 h-4" /> Nova Task</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="glass-surface rounded-xl p-4 flex items-center gap-3 border border-border/20">
              <div className={`p-2 rounded-lg ${cfg.color.split(' ')[0]}`}>
                <Icon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{counts[key as keyof typeof counts]}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 bg-secondary/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em andamento">Em Andamento</SelectItem>
            <SelectItem value="concluída">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filtered.map(t => {
          const sc = statusConfig[t.status] || statusConfig.pendente;
          const pc = priorityConfig[t.priority] || priorityConfig.média;
          const StatusIcon = sc.icon;
          const clientName = getClientName(t.client_id);
          const taskAtts = getTaskAttachments(t.id);

          return (
            <div key={t.id} className="glass-surface rounded-xl p-5 border border-border/20 hover:border-primary/20 transition-all group">
              <div className="flex items-start gap-4">
                {/* Status dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="mt-0.5 shrink-0" title="Alterar status">
                      <StatusIcon className={`w-5 h-5 ${sc.color.split(' ')[1]} transition-transform hover:scale-110`} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {Object.entries(statusConfig).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <DropdownMenuItem key={key} onClick={() => changeStatus(t, key)} className={t.status === key ? 'bg-secondary' : ''}>
                          <Icon className={`w-4 h-4 mr-2 ${cfg.color.split(' ')[1]}`} />
                          {cfg.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-semibold text-foreground ${t.status === 'concluída' ? 'line-through opacity-60' : ''}`}>{t.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${pc.color}`}>{pc.label}</Badge>
                  </div>

                  {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}

                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {clientName && (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {clientName}
                      </span>
                    )}
                    {(t.start_date || t.end_date) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {t.start_date && new Date(t.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        {t.start_date && t.end_date && ' → '}
                        {t.end_date && new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {taskAtts.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> {taskAtts.length} anexo{taskAtts.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Attachments */}
                  {taskAtts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {taskAtts.map(att => (
                        <div key={att.id} className="flex items-center gap-1.5 bg-secondary/50 rounded-lg px-2.5 py-1.5 text-xs group/att">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary truncate max-w-[150px]">
                            {att.file_name}
                          </a>
                          <button onClick={() => removeAttachment(att)} className="opacity-0 group-hover/att:opacity-100 text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(t.id, e.target.files[0]); e.target.value = ''; }} disabled={uploading} />
                    <div className="p-2 rounded-md hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
                      <Upload className="w-4 h-4" />
                    </div>
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)} className="hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma task encontrada.</p>
            <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Criar primeira task</Button>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Task' : 'Nova Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" placeholder="Ex: Criar campanha Black Friday" />
            </div>

            <div>
              <Label className="text-muted-foreground text-sm">Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" rows={3} placeholder="Detalhes da task..." />
            </div>

            <div>
              <Label className="text-muted-foreground text-sm">Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="bg-secondary/50 border-border/50 mt-1">
                  <SelectValue placeholder="Selecionar cliente (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluída">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="média">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Data Início</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Data Fim</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" />
              </div>
            </div>

            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
