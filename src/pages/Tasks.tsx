import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Plus, Search, Calendar, Paperclip, Trash2, Edit2,
  CheckCircle2, Clock, AlertCircle, Upload, X, FileText, XCircle,
  MessageSquare, Send, Eye, CalendarIcon, Filter, Repeat
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  recurrence: string;
  recurrence_interval: number;
  recurrence_days: number[];
}

const recurrenceLabels: Record<string, string> = {
  none: 'Não repetir',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
  yearly: 'Anualmente',
};

const weekDayLabels = [
  { value: 0, label: 'Dom', full: 'Domingo' },
  { value: 1, label: 'Seg', full: 'Segunda' },
  { value: 2, label: 'Ter', full: 'Terça' },
  { value: 3, label: 'Qua', full: 'Quarta' },
  { value: 4, label: 'Qui', full: 'Quinta' },
  { value: 5, label: 'Sex', full: 'Sexta' },
  { value: 6, label: 'Sáb', full: 'Sábado' },
];

const monthLabels = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Computes the next occurrence date based on recurrence type and selected days.
 * - weekly with days [1,3]: next selected weekday after current date
 * - monthly with days [1,15]: next selected day-of-month
 * - yearly with days (months) [0,5]: next selected month, same day
 * - daily / no days selected: just advance by interval
 */
function addRecurrence(
  dateStr: string,
  recurrence: string,
  interval: number,
  days: number[] = [],
): string {
  const d = new Date(dateStr + 'T00:00:00');
  const n = Math.max(1, interval || 1);
  const sortedDays = [...days].sort((a, b) => a - b);

  if (recurrence === 'daily') {
    d.setDate(d.getDate() + n);
    return fmt(d);
  }

  if (recurrence === 'weekly') {
    if (sortedDays.length === 0) {
      d.setDate(d.getDate() + 7 * n);
      return fmt(d);
    }
    // Find next selected weekday strictly after current date
    for (let i = 1; i <= 7 * n + 7; i++) {
      const candidate = new Date(d);
      candidate.setDate(d.getDate() + i);
      if (sortedDays.includes(candidate.getDay())) {
        return fmt(candidate);
      }
    }
    d.setDate(d.getDate() + 7 * n);
    return fmt(d);
  }

  if (recurrence === 'monthly') {
    if (sortedDays.length === 0) {
      d.setMonth(d.getMonth() + n);
      return fmt(d);
    }
    // Find next selected day-of-month
    const currentDay = d.getDate();
    const futureDay = sortedDays.find((day) => day > currentDay);
    if (futureDay) {
      const candidate = new Date(d.getFullYear(), d.getMonth(), futureDay);
      return fmt(candidate);
    }
    // Otherwise jump to first selected day in next month (advance by interval)
    const candidate = new Date(d.getFullYear(), d.getMonth() + n, sortedDays[0]);
    return fmt(candidate);
  }

  if (recurrence === 'yearly') {
    if (sortedDays.length === 0) {
      d.setFullYear(d.getFullYear() + n);
      return fmt(d);
    }
    // days here are months (0-11). Keep day-of-month from original.
    const currentMonth = d.getMonth();
    const futureMonth = sortedDays.find((m) => m > currentMonth);
    if (futureMonth !== undefined) {
      const candidate = new Date(d.getFullYear(), futureMonth, d.getDate());
      return fmt(candidate);
    }
    const candidate = new Date(d.getFullYear() + n, sortedDays[0], d.getDate());
    return fmt(candidate);
  }

  return dateStr;
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

interface Comment {
  id: string;
  task_id: string;
  text: string;
  created_at: string;
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterPeriod, setFilterPeriod] = useState('todos');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [uploading, setUploading] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [newComment, setNewComment] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', status: 'pendente', priority: 'média',
    start_date: '', end_date: '', client_id: '',
    recurrence: 'none', recurrence_interval: 1,
    recurrence_days: [] as number[],
  });

  const load = async () => {
    if (!user) return;
    const [tasksRes, clientsRes, attachRes, commentsRes] = await Promise.all([
      supabase.from('operational_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('task_attachments').select('*').eq('user_id', user.id),
      supabase.from('task_comments').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ]);
    const normalized: Task[] = (tasksRes.data || []).map((t) => ({
      ...t,
      recurrence_days: Array.isArray(t.recurrence_days)
        ? (t.recurrence_days as unknown[]).map((n) => Number(n)).filter((n) => !Number.isNaN(n))
        : [],
    }));
    setTasks(normalized);
    setClients(clientsRes.data || []);
    setAttachments(attachRes.data || []);
    setComments(commentsRes.data || []);
  };

  useEffect(() => { load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', description: '', status: 'pendente', priority: 'média', start_date: '', end_date: '', client_id: '', recurrence: 'none', recurrence_interval: 1, recurrence_days: [] });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title, description: t.description || '', status: t.status, priority: t.priority,
      start_date: t.start_date || '', end_date: t.end_date || '', client_id: t.client_id || '',
      recurrence: t.recurrence || 'none', recurrence_interval: t.recurrence_interval || 1,
      recurrence_days: t.recurrence_days || [],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.title.trim()) { toast.error('Título é obrigatório'); return; }
    const payload = {
      title: form.title.trim(), description: form.description.trim(), status: form.status,
      priority: form.priority, start_date: form.start_date || null, end_date: form.end_date || null,
      client_id: form.client_id && form.client_id !== 'none' ? form.client_id : null,
      recurrence: form.recurrence || 'none',
      recurrence_interval: Math.max(1, Number(form.recurrence_interval) || 1),
      recurrence_days: form.recurrence === 'none' ? [] : [...form.recurrence_days].sort((a, b) => a - b),
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

    // If completing a recurring task, create the next occurrence
    if (newStatus === 'concluída' && t.recurrence && t.recurrence !== 'none' && user) {
      const interval = Math.max(1, t.recurrence_interval || 1);
      const days = t.recurrence_days || [];
      const nextStart = t.start_date ? addRecurrence(t.start_date, t.recurrence, interval, days) : null;
      const nextEnd = t.end_date ? addRecurrence(t.end_date, t.recurrence, interval, days) : null;
      if (nextStart || nextEnd) {
        await supabase.from('operational_tasks').insert({
          user_id: user.id,
          title: t.title,
          description: t.description || '',
          status: 'pendente',
          priority: t.priority,
          start_date: nextStart,
          end_date: nextEnd,
          client_id: t.client_id,
          recurrence: t.recurrence,
          recurrence_interval: interval,
          recurrence_days: days,
        });
        toast.success('Próxima recorrência criada!');
      }
    }
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
    } catch {
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

  const addComment = async (taskId: string) => {
    if (!user || !newComment.trim()) return;
    await supabase.from('task_comments').insert({
      task_id: taskId, user_id: user.id, text: newComment.trim(),
    });
    setNewComment('');
    toast.success('Comentário adicionado!');
    load();
  };

  const removeComment = async (id: string) => {
    await supabase.from('task_comments').delete().eq('id', id);
    toast.success('Comentário removido!');
    load();
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return tasks.filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'todos' || t.status === filterStatus;

      // Period filter — compare as plain date strings (YYYY-MM-DD) to avoid timezone issues
      let matchPeriod = true;
      const endDateStr = t.end_date || '';

      if (filterPeriod === 'custom') {
        if (!endDateStr) { matchPeriod = false; }
        else {
          if (dateFrom) {
            const fromStr = `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, '0')}-${String(dateFrom.getDate()).padStart(2, '0')}`;
            if (endDateStr < fromStr) matchPeriod = false;
          }
          if (dateTo) {
            const toStr = `${dateTo.getFullYear()}-${String(dateTo.getMonth() + 1).padStart(2, '0')}-${String(dateTo.getDate()).padStart(2, '0')}`;
            if (endDateStr > toStr) matchPeriod = false;
          }
        }
      } else if (filterPeriod === 'vencidas') {
        matchPeriod = !!endDateStr && endDateStr < todayStr && t.status !== 'concluída' && t.status !== 'cancelada';
      } else if (filterPeriod === 'hoje') {
        matchPeriod = endDateStr === todayStr;
      } else if (filterPeriod === 'semana') {
        const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
        const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
        matchPeriod = !!endDateStr && endDateStr >= todayStr && endDateStr <= weekEndStr;
      } else if (filterPeriod === 'sem_data') {
        matchPeriod = !endDateStr;
      }

      return matchSearch && matchStatus && matchPeriod;
    });
  }, [tasks, search, filterStatus, filterPeriod, dateFrom, dateTo]);

  const getClientName = (clientId: string | null) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId)?.name || null;
  };

  const getTaskAttachments = (taskId: string) => attachments.filter(a => a.task_id === taskId);
  const getTaskComments = (taskId: string) => comments.filter(c => c.task_id === taskId);

  const counts = useMemo(() => ({
    pendente: tasks.filter(t => t.status === 'pendente').length,
    'em andamento': tasks.filter(t => t.status === 'em andamento').length,
    concluída: tasks.filter(t => t.status === 'concluída').length,
    cancelada: tasks.filter(t => t.status === 'cancelada').length,
  }), [tasks]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks Operacionais</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize suas tarefas e acompanhe o progresso</p>
        </div>
        <Button onClick={openNew} className="neon-glow gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Nova Task</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="glass-surface rounded-xl p-3 sm:p-4 flex items-center gap-3 border border-border/20 min-w-0">
              <div className={`p-2 rounded-lg shrink-0 ${cfg.color.split(' ')[0]}`}>
                <Icon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{counts[key as keyof typeof counts]}</p>
                <p className="text-xs text-muted-foreground truncate">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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
        <Select value={filterPeriod} onValueChange={(v) => { setFilterPeriod(v); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
          <SelectTrigger className="w-44 bg-secondary/50 border-border/50">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Períodos</SelectItem>
            <SelectItem value="vencidas">Vencidas</SelectItem>
            <SelectItem value="hoje">Vence Hoje</SelectItem>
            <SelectItem value="semana">Próx. 7 dias</SelectItem>
            <SelectItem value="sem_data">Sem Data</SelectItem>
            <SelectItem value="custom">Período Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom date range */}
      {filterPeriod === 'custom' && (
        <div className="flex gap-3 items-center flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-44 justify-start text-left font-normal bg-secondary/50 border-border/50", !dateFrom && "text-muted-foreground")}>
                <Calendar className="w-4 h-4 mr-2" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-44 justify-start text-left font-normal bg-secondary/50 border-border/50", !dateTo && "text-muted-foreground")}>
                <Calendar className="w-4 h-4 mr-2" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      )}

      {/* Kanban board */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma task encontrada.</p>
          <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Criar primeira task</Button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-4 lg:-mx-6 px-4 lg:px-6">
          <div className="flex gap-4 min-w-max lg:min-w-0 lg:grid lg:grid-cols-4">
            {(['pendente', 'em andamento', 'concluída', 'cancelada'] as const).map(statusKey => {
              const tasksInStatus = filtered.filter(t => t.status === statusKey);
              const cfg = statusConfig[statusKey];
              const Icon = cfg.icon;

              return (
                <div
                  key={statusKey}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverStatus !== statusKey) setDragOverStatus(statusKey); }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || draggingId;
                    const task = tasks.find(t => t.id === id);
                    if (task && task.status !== statusKey) changeStatus(task, statusKey);
                    setDraggingId(null);
                    setDragOverStatus(null);
                  }}
                  className={`w-80 lg:w-auto shrink-0 glass-surface rounded-xl border flex flex-col max-h-[calc(100vh-360px)] min-h-[300px] transition-colors ${
                    dragOverStatus === statusKey ? 'border-primary/60 bg-primary/5' : 'border-border/20'
                  }`}
                >
                  {/* Column header */}
                  <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2 shrink-0">
                    <div className={`p-1.5 rounded-lg ${cfg.color.split(' ')[0]}`}>
                      <Icon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
                    </div>
                    <span className="font-semibold text-foreground text-sm flex-1">{cfg.label}</span>
                    <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{tasksInStatus.length}</Badge>
                  </div>

                  {/* Column body */}
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-2">
                      {tasksInStatus.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">Solte aqui</p>
                      ) : (
                        tasksInStatus.map(t => {
                          const sc = statusConfig[t.status] || statusConfig.pendente;
                          const pc = priorityConfig[t.priority] || priorityConfig.média;
                          const StatusIcon = sc.icon;
                          const clientName = getClientName(t.client_id);
                          const taskAtts = getTaskAttachments(t.id);
                          const taskComments = getTaskComments(t.id);

                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggingId(t.id);
                                e.dataTransfer.setData('text/plain', t.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                              className={`rounded-lg p-3 bg-secondary/30 hover:bg-secondary/60 transition-all group border border-border/10 cursor-grab active:cursor-grabbing ${
                                draggingId === t.id ? 'opacity-40' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => setDetailTask(t)}
                                >
                                  <h3 className={`font-medium text-sm text-foreground leading-snug ${t.status === 'concluída' || t.status === 'cancelada' ? 'line-through opacity-60' : ''}`}>
                                    {t.title}
                                  </h3>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="p-1 rounded hover:bg-secondary" title="Alterar status">
                                        <StatusIcon className={`w-3.5 h-3.5 ${sc.color.split(' ')[1]}`} />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {Object.entries(statusConfig).map(([key, cfgItem]) => {
                                        const DdIcon = cfgItem.icon;
                                        return (
                                          <DropdownMenuItem key={key} onClick={() => changeStatus(t, key)} className={t.status === key ? 'bg-secondary' : ''}>
                                            <DdIcon className={`w-4 h-4 mr-2 ${cfgItem.color.split(' ')[1]}`} />
                                            {cfgItem.label}
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <button onClick={() => openEdit(t)} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Editar">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive" title="Excluir">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir task?</AlertDialogTitle>
                                        <AlertDialogDescription>Essa ação não pode ser desfeita. A task "{t.title}" será removida permanentemente.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => remove(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap cursor-pointer" onClick={() => setDetailTask(t)}>
                                <Badge variant="outline" className={`text-[10px] ${pc.color}`}>{pc.label}</Badge>
                                {t.recurrence && t.recurrence !== 'none' && (
                                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 gap-1">
                                    <Repeat className="w-2.5 h-2.5" />
                                    {recurrenceLabels[t.recurrence] || t.recurrence}
                                  </Badge>
                                )}
                              </div>

                              {clientName && (
                                <div className="mt-2 cursor-pointer" onClick={() => setDetailTask(t)}>
                                  <span className="text-xs text-primary flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {clientName}
                                  </span>
                                </div>
                              )}

                              {(t.end_date || taskAtts.length > 0 || taskComments.length > 0) && (
                                <div className="flex items-center gap-3 mt-2 flex-wrap cursor-pointer" onClick={() => setDetailTask(t)}>
                                  {t.end_date && (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                  {taskAtts.length > 0 && (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Paperclip className="w-3 h-3" /> {taskAtts.length}
                                    </span>
                                  )}
                                  {taskComments.length > 0 && (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" /> {taskComments.length}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailTask} onOpenChange={(o) => { if (!o) setDetailTask(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {detailTask && (() => {
            const sc = statusConfig[detailTask.status] || statusConfig.pendente;
            const pc = priorityConfig[detailTask.priority] || priorityConfig.média;
            const clientName = getClientName(detailTask.client_id);
            const taskAtts = getTaskAttachments(detailTask.id);
            const taskComments = getTaskComments(detailTask.id);

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-lg">{detailTask.title}</DialogTitle>
                    <Badge variant="outline" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${pc.color}`}>{pc.label}</Badge>
                  </div>
                  {clientName && <p className="text-sm text-primary mt-1">{clientName}</p>}
                  {(detailTask.start_date || detailTask.end_date) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" />
                      {detailTask.start_date && new Date(detailTask.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      {detailTask.start_date && detailTask.end_date && ' → '}
                      {detailTask.end_date && new Date(detailTask.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </DialogHeader>

                {detailTask.description && (
                  <p className="text-sm text-muted-foreground mt-2">{detailTask.description}</p>
                )}

                <Tabs defaultValue="comments" className="flex-1 flex flex-col mt-4 min-h-0">
                  <TabsList className="w-full">
                    <TabsTrigger value="comments" className="flex-1 gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Comentários ({taskComments.length})
                    </TabsTrigger>
                    <TabsTrigger value="attachments" className="flex-1 gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" /> Anexos ({taskAtts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="comments" className="flex-1 flex flex-col min-h-0 mt-3">
                    <ScrollArea className="flex-1 max-h-[300px] pr-2">
                      {taskComments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nenhum comentário ainda.</p>
                      ) : (
                        <div className="space-y-3">
                          {taskComments.map(c => (
                            <div key={c.id} className="bg-secondary/50 rounded-lg p-3 group/comment">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-foreground whitespace-pre-wrap flex-1">{c.text}</p>
                                <button onClick={() => removeComment(c.id)} className="opacity-0 group-hover/comment:opacity-100 text-muted-foreground hover:text-destructive shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1.5">
                                {new Date(c.created_at).toLocaleDateString('pt-BR')} às {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
                      <Input
                        placeholder="Insira seu comentário aqui"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(detailTask.id); } }}
                        className="bg-secondary/50 border-border/50"
                      />
                      <Button size="icon" onClick={() => addComment(detailTask.id)} disabled={!newComment.trim()} className="shrink-0">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="attachments" className="flex-1 flex flex-col min-h-0 mt-3">
                    <ScrollArea className="flex-1 max-h-[300px] pr-2">
                      {taskAtts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nenhum anexo.</p>
                      ) : (
                        <div className="space-y-2">
                          {taskAtts.map(att => (
                            <div key={att.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2.5 group/att">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary flex-1 truncate">
                                {att.file_name}
                              </a>
                              <button onClick={() => removeAttachment(att)} className="opacity-0 group-hover/att:opacity-100 text-muted-foreground hover:text-destructive shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <div className="mt-3 pt-3 border-t border-border/30">
                      <label className="cursor-pointer">
                        <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(detailTask.id, e.target.files[0]); e.target.value = ''; }} disabled={uploading} />
                        <div className="flex items-center justify-center gap-2 border border-dashed border-border/50 rounded-lg p-3 hover:border-primary/50 hover:bg-secondary/30 transition-colors text-sm text-muted-foreground hover:text-foreground">
                          <Upload className="w-4 h-4" />
                          {uploading ? 'Enviando...' : 'Clique para adicionar anexo'}
                        </div>
                      </label>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Recorrência</Label>
                <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(recurrenceLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.recurrence !== 'none' && (
                <div>
                  <Label className="text-muted-foreground text-sm">Intervalo (a cada)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.recurrence_interval}
                    onChange={(e) => setForm({ ...form, recurrence_interval: Math.max(1, Number(e.target.value) || 1) })}
                    className="bg-secondary/50 border-border/50 mt-1"
                  />
                </div>
              )}
            </div>
            {form.recurrence === 'weekly' && (
              <div>
                <Label className="text-muted-foreground text-sm">Dias da semana</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {weekDayLabels.map((wd) => {
                    const active = form.recurrence_days.includes(wd.value);
                    return (
                      <button
                        type="button"
                        key={wd.value}
                        onClick={() => {
                          const next = active
                            ? form.recurrence_days.filter((d) => d !== wd.value)
                            : [...form.recurrence_days, wd.value];
                          setForm({ ...form, recurrence_days: next });
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/50',
                        )}
                        title={wd.full}
                      >
                        {wd.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Selecione um ou mais dias. A próxima ocorrência cairá no próximo dia escolhido.
                </p>
              </div>
            )}
            {form.recurrence === 'monthly' && (
              <div>
                <Label className="text-muted-foreground text-sm">Dias do mês</Label>
                <div className="grid grid-cols-7 gap-1.5 mt-2">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const active = form.recurrence_days.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => {
                          const next = active
                            ? form.recurrence_days.filter((d) => d !== day)
                            : [...form.recurrence_days, day];
                          setForm({ ...form, recurrence_days: next });
                        }}
                        className={cn(
                          'h-8 rounded-md text-xs font-medium border transition-all',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/50',
                        )}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Selecione um ou mais dias do mês para repetir.
                </p>
              </div>
            )}
            {form.recurrence === 'yearly' && (
              <div>
                <Label className="text-muted-foreground text-sm">Meses do ano</Label>
                <div className="grid grid-cols-6 gap-1.5 mt-2">
                  {monthLabels.map((m, idx) => {
                    const active = form.recurrence_days.includes(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => {
                          const next = active
                            ? form.recurrence_days.filter((d) => d !== idx)
                            : [...form.recurrence_days, idx];
                          setForm({ ...form, recurrence_days: next });
                        }}
                        className={cn(
                          'h-8 rounded-md text-xs font-medium border transition-all',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/50',
                        )}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Selecione os meses em que a tarefa deve repetir.
                </p>
              </div>
            )}
            {form.recurrence !== 'none' && (
              <p className="text-xs text-muted-foreground">
                Ao marcar como concluída, uma nova ocorrência será criada automaticamente com as datas avançadas.
              </p>
            )}
            <Button onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
