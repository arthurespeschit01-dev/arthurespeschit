import {readAllRows} from '@/lib/readAllRows';
import {isClosedTask,closedInPeriod,taskDay} from '@/lib/taskViews';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Search, Calendar, Paperclip,
  CheckCircle2, Clock, AlertCircle, Upload, X, FileText, XCircle,
  MessageSquare, Send, Filter, Repeat, MoreHorizontal, ListTodo, LayoutGrid, CalendarDays, History
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

import type {Task,TaskSubtask,TaskPatch} from '@/lib/tasks';
import {taskDeadline} from '@/lib/tasks';
import {TaskTable} from '@/components/tasks/TaskTable';
import {TaskCalendar} from '@/components/tasks/TaskCalendar';
import {TaskSubtasks} from '@/components/tasks/TaskSubtasks';
import {TaskActions} from '@/components/tasks/TaskActions';
import {TaskProgress} from '@/components/tasks/TaskProgress';
import {TaskBulkActions} from '@/components/tasks/TaskBulkActions';

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

interface Client {
  id: string;
  name: string;
  status: string | null;
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
  const userId=user?.id;const loadSequence=useRef(0);const mutationLock=useRef(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [subtasks,setSubtasks]=useState<TaskSubtask[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [groupBy,setGroupBy]=useState('status');
  const [filterAssignee,setFilterAssignee]=useState('todos');
  const [mutating,setMutating]=useState(false);
  const [deleting,setDeleting]=useState<{kind:'task'|'comment'|'attachment';id:string;title:string}|null>(null);
  const [view,setView]=useState('tabela');
  const [historyPeriod,setHistoryPeriod]=useState('semana');
  const [historyFrom,setHistoryFrom]=useState(''),[historyTo,setHistoryTo]=useState('');
  const [closedExpanded,setClosedExpanded]=useState<Record<string,boolean>>({});
  const [filterClient,setFilterClient]=useState('todos'),[filterPriority,setFilterPriority]=useState('todos'),[sort,setSort]=useState('prazo');
  const [saving,setSaving]=useState(false);
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
    title: '', description: '', status: 'pendente', priority: 'média', assignee_name:'',
    start_date: '', end_date: '', client_id: '',
    recurrence: 'none', recurrence_interval: 1,
    recurrence_days: [] as number[],
  });

  const load = useCallback(async () => {
    if (!userId) return;const version=++loadSequence.current;
    const [tasksRes, clientsRes, attachRes, commentsRes, subtaskRes] = await Promise.all([
      readAllRows((from,to)=>supabase.from('operational_tasks').select('*').eq('user_id',userId).order('created_at',{ascending:false}).order('id').range(from,to)),
      supabase.from('clients').select('id, name, status').eq('user_id', userId).order('name'),
      supabase.from('task_attachments').select('*').eq('user_id', userId),
      supabase.from('task_comments').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      readAllRows<TaskSubtask>((a,b)=>supabase.from('agency_task_subtasks').select('*').eq('user_id',userId).order('position').order('created_at').order('id').range(a,b)),
    ]);
    if(version!==loadSequence.current)return;
    if(tasksRes.error||clientsRes.error||attachRes.error||commentsRes.error||subtaskRes.error){toast.error('Não foi possível carregar as tarefas. Tente novamente.');return;}
    const normalized: Task[] = (tasksRes.data || []).map((t) => ({
      ...t, assignee_name:t.assignee_name||'',recurrence_of:t.recurrence_of||null,
      recurrence_days: Array.isArray(t.recurrence_days)
        ? (t.recurrence_days as unknown[]).map((n) => Number(n)).filter((n) => !Number.isNaN(n))
        : [],
    }));
    setTasks(normalized);
    setDetailTask(current=>current?normalized.find(t=>t.id===current.id)||null:null);
    setSubtasks(subtaskRes.data);
    setClients(clientsRes.data || []);
    setAttachments(attachRes.data || []);
    setComments(commentsRes.data || []);
  },[userId]);

  useEffect(() => {void load();if(!userId)return;const sequence=loadSequence;let timer:ReturnType<typeof setTimeout>;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!mutationLock.current)void load()},250)};
    let channel=supabase.channel(`tasks-${userId}-${crypto.randomUUID()}`);
    for(const table of ['operational_tasks','agency_task_subtasks','task_comments','task_attachments'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${userId}`},refresh);
    channel.subscribe();const interval=setInterval(()=>{if(!document.hidden)refresh()},15000);window.addEventListener('focus',refresh);
    return()=>{++sequence.current;clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',refresh);void supabase.removeChannel(channel)};
  }, [load,userId]);
  useEffect(()=>{setSelected(new Set())},[view,search,filterStatus,filterPeriod,filterClient,filterPriority,filterAssignee]);

  const openNew = () => {
    setEditing(null);if(view==='historico')setView('tabela');setFilterStatus('todos');setFilterPeriod('todos');setSearch('');
    setForm({ title: '', description: '', status: 'pendente', priority: filterPriority==='todos'?'média':filterPriority, start_date: '', end_date: '', client_id: filterClient==='todos'?'':filterClient, recurrence: 'none', recurrence_interval: 1, recurrence_days: [],assignee_name:filterAssignee==='todos'||filterAssignee==='none'?'':filterAssignee });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title, description: t.description || '', status: t.status, priority: t.priority,assignee_name:t.assignee_name||'',
      start_date: t.start_date || '', end_date: t.end_date || '', client_id: t.client_id || '',
      recurrence: t.recurrence || 'none', recurrence_interval: t.recurrence_interval || 1,
      recurrence_days: t.recurrence_days || [],
    });
    setOpen(true);
  };

  const save = async () => {
    if(saving||mutationLock.current)return;
    if (!user || !form.title.trim()) { toast.error('Título é obrigatório'); return; }
    const payload = {
      title: form.title.trim(), description: form.description.trim(), status: form.status,assignee_name:form.assignee_name.trim(),
      priority: form.priority, start_date: form.start_date || null, end_date: form.end_date || null,
      client_id: form.client_id && form.client_id !== 'none' ? form.client_id : null,
      recurrence: form.recurrence || 'none',
      recurrence_interval: Math.min(1000,Math.max(1, Number(form.recurrence_interval) || 1)),
      recurrence_days: form.recurrence === 'none' ? [] : [...form.recurrence_days].sort((a, b) => a - b),
    };
    if(form.start_date&&form.end_date&&form.start_date>form.end_date){toast.error('O prazo deve ser igual ou posterior à data de início.');return;}
    setSaving(true);
    if (editing) {
      const {error}=await supabase.rpc('agency_tasks_update',{p_ids:[editing.id],p_patch:payload});
      if(error){setSaving(false);toast.error('Não foi possível salvar a tarefa.');return;}
      toast.success('Tarefa atualizada!');
    } else {
      const {error}=await supabase.from('operational_tasks').insert({ ...payload, user_id: user.id });
      if(error){setSaving(false);toast.error('Não foi possível criar a tarefa.');return;}
      toast.success('Tarefa criada!');
    }
    setSaving(false);setOpen(false);
    load();
  };

  const applyPatch=async(ids:string[],patch:TaskPatch)=>{
    if(!userId||mutationLock.current||!ids.length)return false;mutationLock.current=true;setMutating(true);++loadSequence.current;
    const {error}=await supabase.rpc('agency_tasks_update',{p_ids:ids,p_patch:patch});
    if(error)toast.error('Não foi possível atualizar. Nenhuma tarefa foi alterada.');
    else await load();
    mutationLock.current=false;setMutating(false);return !error;
  };
  const changeStatus = async (t:Task,newStatus:string)=>{
    if(t.status===newStatus)return true;
    if(!await applyPatch([t.id],{status:newStatus}))return false;
    if(isClosedTask({status:newStatus}))toast.success(newStatus==='concluída'?'Tarefa concluída. Disponível no histórico.':'Tarefa cancelada. Disponível no histórico.');
    else if(isClosedTask(t))toast.success('Tarefa reaberta.',{action:{label:'Ver no quadro',onClick:()=>{setView('quadro');setFilterStatus('todos')}}});
    return true;
  };
  const updateTask=async(t:Task,patch:TaskPatch)=>{if(patch.status)return changeStatus(t,patch.status);const ok=await applyPatch([t.id],patch);if(ok)toast.success('Tarefa atualizada!');return ok};
  const duplicate=async(t:Task)=>{if(mutationLock.current)return;mutationLock.current=true;setMutating(true);const {error}=await supabase.rpc('agency_task_duplicate',{p_id:t.id});if(error)toast.error('Não foi possível duplicar a tarefa.');else {toast.success('Cópia criada com as subtarefas reiniciadas.');await load()}mutationLock.current=false;setMutating(false)};
  const requestDelete=(t:Task)=>setDeleting({kind:'task',id:t.id,title:t.title});
  const executeDelete=async()=>{
    if(!deleting||!userId||mutationLock.current)return;mutationLock.current=true;setMutating(true);
    const table=deleting.kind==='task'?'operational_tasks':deleting.kind==='comment'?'task_comments':'task_attachments';
    const {error}=await supabase.from(table).delete().eq('id',deleting.id).eq('user_id',userId).select('id').single();
    if(error)toast.error('Não foi possível excluir.');else {setDeleting(null);toast.success('Registro excluído.');await load()}
    mutationLock.current=false;setMutating(false);
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

  const removeAttachment = (att:Attachment)=>setDeleting({kind:'attachment',id:att.id,title:att.file_name});

  const addComment = async (taskId: string) => {
    if (!user || !newComment.trim()) return;
    await supabase.from('task_comments').insert({
      task_id: taskId, user_id: user.id, text: newComment.trim(),
    });
    setNewComment('');
    toast.success('Comentário adicionado!');
    load();
  };

  const removeComment = (id:string)=>setDeleting({kind:'comment',id,title:'comentário'});

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = taskDay(now.toISOString());

    return tasks.filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase()) || t.assignee_name.toLowerCase().includes(search.toLowerCase()) || clients.find(c=>c.id===t.client_id)?.name.toLowerCase().includes(search.toLowerCase());
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
        const weekEnd = new Date(todayStr+'T12:00:00Z');weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
        const weekEndStr = weekEnd.toISOString().slice(0,10);
        matchPeriod = !!endDateStr && endDateStr >= todayStr && endDateStr <= weekEndStr;
      } else if (filterPeriod === 'sem_data') {
        matchPeriod = !endDateStr;
      }

      const closed=isClosedTask(t);
      const matchView=view==='historico'?closed&&closedInPeriod(t,historyPeriod,historyFrom,historyTo):view==='quadro'?(!closed||closedInPeriod(t,'semana')):!closed;
      return matchSearch && matchStatus && (view==='historico'||matchPeriod) && matchView && (filterClient==='todos'||t.client_id===filterClient) && (filterPriority==='todos'||t.priority===filterPriority)&&(filterAssignee==='todos'||(filterAssignee==='none'?!t.assignee_name:t.assignee_name===filterAssignee));
    }).sort((a,b)=>{
      if(sort==='titulo')return a.title.localeCompare(b.title,'pt-BR');
      if(sort==='prioridade'){const priority:Record<string,number>={'alta':0,'média':1,'baixa':2};return (priority[a.priority]??3)-(priority[b.priority]??3)||(a.end_date||'9999').localeCompare(b.end_date||'9999');}
      if(view==='historico')return (b.closed_at||'').localeCompare(a.closed_at||'');
      return (a.end_date||'9999').localeCompare(b.end_date||'9999')||a.title.localeCompare(b.title,'pt-BR');
    });
  }, [tasks, search, filterStatus, filterPeriod, dateFrom, dateTo,view,historyPeriod,historyFrom,historyTo,filterClient,filterPriority,filterAssignee,sort,clients]);

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
          <h1 className="text-2xl font-bold text-foreground">Tarefas Operacionais</h1>
          <p className="text-muted-foreground text-sm mt-1">Planeje entregas, distribua responsáveis e acompanhe cada etapa</p>
        </div>
        <Button onClick={openNew} className="neon-glow gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Nova Tarefa</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button type="button" aria-label={`Ver tarefas ${cfg.label.toLowerCase()}s`} onClick={()=>{setView(isClosedTask({status:key})?'historico':'quadro');setFilterStatus(key);if(isClosedTask({status:key}))setHistoryPeriod('todos')}} key={key} className="text-left glass-surface rounded-xl p-3 sm:p-4 flex items-center gap-3 border border-border/20 min-w-0">
              <div className={`p-2 rounded-lg shrink-0 ${cfg.color.split(' ')[0]}`}>
                <Icon className={`w-4 h-4 ${cfg.color.split(' ')[1]}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{counts[key as keyof typeof counts]}</p>
                <p className="text-xs text-muted-foreground leading-tight">{cfg.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3"><div role="tablist" aria-label="Visualização de tarefas" className="grid grid-cols-2 sm:flex w-full sm:w-fit rounded-lg bg-secondary/50 p-1 gap-1">{[{id:'tabela',label:'Tabela',icon:ListTodo},{id:'quadro',label:'Quadro de trabalho',icon:LayoutGrid},{id:'calendario',label:'Calendário',icon:CalendarDays},{id:'historico',label:'Histórico',icon:History}].map(tab=><Button key={tab.id} role="tab" aria-selected={view===tab.id} variant={view===tab.id?'default':'ghost'} className="min-h-11 shrink-0 gap-2" onClick={()=>{setView(tab.id);setFilterStatus('todos')}}><tab.icon size={16}/>{tab.label}</Button>)}</div>
      <p className="text-xs text-muted-foreground">{view==='quadro'?'Pendentes e em andamento sem limite de semana. Concluídas e canceladas desta semana ficam recolhidas. Consulte os demais períodos no Histórico.':view==='historico'?'Filtre pela data real de conclusão ou cancelamento. Tarefas antigas sem essa informação ficam em “Sem data registrada” ou “Todo o histórico”.':'Tarefas em aberto, com edição rápida. Concluídas e canceladas ficam no Histórico.'}</p>
      {view==='historico'&&<div className="flex gap-3 flex-wrap items-end"><div><Label htmlFor="task-history-period">Período de encerramento</Label><select id="task-history-period" value={historyPeriod} onChange={e=>setHistoryPeriod(e.target.value)} className="block h-10 rounded-md bg-secondary border border-border px-3 text-sm mt-1"><option value="semana">Esta semana</option><option value="anterior">Semana passada</option><option value="mes">Este mês</option><option value="todos">Todo o histórico</option><option value="sem_data">Sem data registrada</option><option value="custom">Período personalizado</option></select></div>{historyPeriod==='custom'&&<><div><Label htmlFor="closed-from">Encerradas a partir de</Label><Input id="closed-from" type="date" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)}/></div><div><Label htmlFor="closed-to">Encerradas até</Label><Input id="closed-to" type="date" min={historyFrom||undefined} value={historyTo} onChange={e=>setHistoryTo(e.target.value)}/></div></>}</div>}
      </div>
      {/* Search & Filter */}
      <div className="grid grid-cols-2 sm:flex gap-3 sm:flex-wrap">
        <div className="relative col-span-2 sm:flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input aria-label="Buscar tarefas" placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
        </div>
        <Select value={filterStatus} onValueChange={value=>{setFilterStatus(value);if(isClosedTask({status:value})&&view!=='historico'){setView('historico');setHistoryPeriod('todos')}}}>
          <SelectTrigger aria-label="Filtrar status das tarefas" className="w-full sm:w-44 bg-secondary/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Status</SelectItem>
            {view!=='historico'&&<><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="em andamento">Em Andamento</SelectItem></>}
            <SelectItem value="concluída">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        {view!=='historico'&&<Select value={filterPeriod} onValueChange={(v) => { setFilterPeriod(v); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
          <SelectTrigger aria-label="Filtrar prazo das tarefas" className="w-full sm:w-44 bg-secondary/50 border-border/50">
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
        </Select>}
      </div>

      {view==='tabela'&&<div className="flex flex-wrap items-center gap-3"><Label htmlFor="task-group">Agrupar por</Label><select id="task-group" value={groupBy} onChange={e=>setGroupBy(e.target.value)} className="h-11 rounded-md border bg-secondary px-3 text-sm"><option value="status">Status</option><option value="cliente">Cliente</option><option value="responsavel">Responsável</option><option value="prioridade">Prioridade</option><option value="nenhum">Sem agrupamento</option></select></div>}
      <details className="rounded-lg border border-border/40 bg-secondary/10 p-3"><summary className="cursor-pointer text-sm font-medium flex items-center gap-2 min-h-10"><Filter size={16}/>Filtros e ordenação{(filterClient!=='todos'||filterPriority!=='todos'||filterAssignee!=='todos'||sort!=='prazo')&&<Badge variant="outline">Ativos</Badge>}</summary>
      <div className="flex gap-3 flex-wrap pt-3"><select aria-label="Filtrar tarefas por cliente" value={filterClient} onChange={e=>setFilterClient(e.target.value)} className="h-10 max-w-full rounded-md border border-border bg-secondary px-3 text-sm"><option value="todos">Todos os clientes</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Filtrar prioridade das tarefas" value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="h-10 rounded-md border border-border bg-secondary px-3 text-sm"><option value="todos">Todas as prioridades</option><option value="alta">Alta</option><option value="média">Média</option><option value="baixa">Baixa</option></select><select aria-label="Filtrar tarefas por responsável" value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} className="h-11 max-w-full rounded-md border border-border bg-secondary px-3 text-sm"><option value="todos">Todos os responsáveis</option><option value="none">Sem responsável</option>{[...new Set(tasks.map(t=>t.assignee_name).filter(Boolean))].sort().map(name=><option key={name} value={name}>{name}</option>)}</select><select aria-label="Ordenar tarefas" value={sort} onChange={e=>setSort(e.target.value)} className="h-10 rounded-md border border-border bg-secondary px-3 text-sm"><option value="prazo">{view==='historico'?'Encerradas mais recentes':'Prazo mais próximo'}</option><option value="prioridade">Prioridade</option><option value="titulo">Título</option></select><Button variant="ghost" onClick={()=>{setSearch('');setFilterStatus('todos');setFilterPeriod('todos');setFilterClient('todos');setFilterPriority('todos');setFilterAssignee('todos');setDateFrom(undefined);setDateTo(undefined);setSort('prazo');setHistoryPeriod('semana');setHistoryFrom('');setHistoryTo('')}}>Limpar filtros</Button></div>
      </details>
      {/* Custom date range */}
      {view!=='historico' && filterPeriod === 'custom' && (
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

      {view!=='historico'&&<div className="flex gap-2 flex-wrap" aria-label="Atalhos de prazo">{[{key:'todos',label:'Em aberto'},{key:'vencidas',label:'Atrasadas'},{key:'hoje',label:'Hoje'},{key:'semana',label:'Próximos 7 dias'}].map(chip=><Button key={chip.key} variant={filterPeriod===chip.key?'secondary':'ghost'} className="min-h-11 text-xs" onClick={()=>setFilterPeriod(chip.key)}>{chip.label} ({tasks.filter(t=>!isClosedTask(t)&&(chip.key==='todos'||chip.key==='vencidas'&&taskDeadline(t)==='atrasada'||chip.key==='hoje'&&taskDeadline(t)==='hoje'||chip.key==='semana'&&!!t.end_date&&t.end_date>=taskDay(new Date().toISOString())&&t.end_date<=new Date(new Date(taskDay(new Date().toISOString())+'T12:00:00Z').getTime()+7*86400000).toISOString().slice(0,10))).length})</Button>)}</div>}
      {view==='tabela'&&<><TaskBulkActions count={filtered.filter(t=>selected.has(t.id)).length} busy={mutating||saving} onClear={()=>setSelected(new Set())} onApply={async patch=>{const ok=await applyPatch(filtered.filter(t=>selected.has(t.id)).map(t=>t.id),patch);if(ok)toast.success('Tarefas selecionadas atualizadas.');return ok}}/><TaskTable tasks={filtered} clients={clients} subtasks={subtasks} groupBy={groupBy} selected={selected} busy={mutating||saving} onSelect={id=>setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next})} onSelectAll={()=>setSelected(prev=>filtered.every(t=>prev.has(t.id))?new Set():new Set(filtered.map(t=>t.id)))} onUpdate={updateTask} onOpen={setDetailTask} onEdit={openEdit} onDuplicate={t=>void duplicate(t)} onDelete={requestDelete}/></>}
      {view==='calendario'&&<TaskCalendar tasks={filtered} onOpen={setDetailTask}/>}
      {/* Kanban board */}
      {(view==='quadro'||view==='historico')&&<>
      {view==='historico'&&filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma tarefa encontrada.</p>
          <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Criar tarefa</Button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-4 lg:-mx-6 px-4 lg:px-6">
          <div className={`flex gap-4 min-w-max lg:min-w-0 lg:grid ${view==='historico'?'lg:grid-cols-2':'lg:grid-cols-4'}`}>
            {(['pendente', 'em andamento', 'concluída', 'cancelada'] as const).filter(status=>(view!=='historico'||isClosedTask({status}))&&(filterStatus==='todos'||filterStatus===status)).map(statusKey => {
              const tasksInStatus = filtered.filter(t => t.status === statusKey);
              const cfg = statusConfig[statusKey];
              const Icon = cfg.icon;

              return (
                <div
                  key={statusKey}
                  role="region" aria-label={`Coluna ${statusConfig[statusKey].label}`}
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
                  className={`w-80 lg:w-auto shrink-0 glass-surface rounded-xl border flex flex-col max-h-[calc(100vh-360px)] min-h-[240px] transition-colors ${
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

                  {view==='quadro'&&isClosedTask({status:statusKey})&&<div className="p-2 space-y-2"><Button variant="ghost" className="w-full min-h-11 text-xs" aria-expanded={!!closedExpanded[statusKey]} onClick={()=>setClosedExpanded(current=>({...current,[statusKey]:!current[statusKey]}))}>{closedExpanded[statusKey]?'Recolher':'Mostrar'} {cfg.label.toLowerCase()}s desta semana ({tasksInStatus.length})</Button><Button variant="outline" className="w-full min-h-11 text-xs" onClick={()=>{setView('historico');setFilterStatus(statusKey);setHistoryPeriod('todos')}}>Ver todo o histórico</Button></div>}
                  {/* Column body */}
                  {(view==='historico'||!isClosedTask({status:statusKey})||closedExpanded[statusKey])&&<ScrollArea className="flex-1">
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
                              role="article" aria-label={t.title}
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
                              <div className="flex flex-col gap-2 mb-2">
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => setDetailTask(t)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setDetailTask(t)}}
                                >
                                  <h3 className={`font-medium text-sm text-foreground leading-snug ${t.status === 'concluída' || t.status === 'cancelada' ? 'line-through opacity-60' : ''}`}>
                                    {t.title}
                                  </h3>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-secondary" aria-label={`Alterar status de ${t.title}`} title="Alterar status">
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
                                  <TaskActions title={t.title} disabled={mutating||saving} onOpen={()=>setDetailTask(t)} onEdit={()=>openEdit(t)} onDuplicate={()=>void duplicate(t)} onDelete={()=>requestDelete(t)}/>
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

                              {t.assignee_name&&<p className="mt-2 text-xs text-muted-foreground">Responsável: {t.assignee_name}</p>}
                              {subtasks.some(item=>item.task_id===t.id)&&<div className="mt-3"><TaskProgress items={subtasks.filter(item=>item.task_id===t.id)}/></div>}
                              {taskDeadline(t)==='atrasada'&&<Badge variant="outline" className="text-destructive mt-2">Atrasada</Badge>}
                              {isClosedTask(t)&&<Button variant="outline" size="sm" className="min-h-11 w-full mt-2" aria-label={`Reabrir ${t.title}`} onClick={()=>void changeStatus(t,'pendente')}>Reabrir tarefa</Button>}
                              {isClosedTask(t)&&<p className="text-[11px] text-muted-foreground mt-2">{t.closed_at?`${t.status==='concluída'?'Concluída':'Cancelada'} em ${new Date(t.closed_at).toLocaleString('pt-BR')}`:'Data de encerramento não registrada'}</p>}
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
                  </ScrollArea>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      </>}
      {/* Detail Dialog */}
      <Dialog open={!!detailTask} onOpenChange={(o) => { if (!o) setDetailTask(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90dvh] overflow-y-auto flex flex-col">
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
                    <DialogTitle className="text-lg flex-1 min-w-0 break-words">{detailTask.title}</DialogTitle><TaskActions title={detailTask.title} disabled={mutating} onEdit={()=>{setDetailTask(null);openEdit(detailTask)}} onDuplicate={()=>void duplicate(detailTask)} onDelete={()=>requestDelete(detailTask)}/>
                    <Badge variant="outline" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${pc.color}`}>{pc.label}</Badge>
                  </div>
                  {detailTask.assignee_name&&<p className="text-xs text-muted-foreground">Responsável: {detailTask.assignee_name}</p>}
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

                <Tabs defaultValue="subtasks" className="flex-1 flex flex-col mt-4 min-h-0">
                  <TabsList className="w-full h-auto flex-wrap">
                    <TabsTrigger value="subtasks" className="flex-1 min-h-11 gap-1.5"><ListTodo size={14}/>Subtarefas ({subtasks.filter(item=>item.task_id===detailTask.id).length})</TabsTrigger>
                    <TabsTrigger value="comments" className="flex-1 gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Comentários ({taskComments.length})
                    </TabsTrigger>
                    <TabsTrigger value="attachments" className="flex-1 gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" /> Anexos ({taskAtts.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="subtasks" className="mt-3"><TaskSubtasks taskId={detailTask.id} items={subtasks.filter(item=>item.task_id===detailTask.id)} onChange={load}/></TabsContent>
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
                                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Ações do comentário"><MoreHorizontal size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onSelect={()=>removeComment(c.id)}>Excluir comentário</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
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
                              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Ações do anexo ${att.file_name}`}><MoreHorizontal size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onSelect={()=>removeAttachment(att)}>Excluir anexo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
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

      <AlertDialog open={!!deleting} onOpenChange={value=>{if(!value&&!mutating)setDeleting(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir {deleting?.kind==='task'?'tarefa':deleting?.kind==='attachment'?'anexo':'comentário'}?</AlertDialogTitle><AlertDialogDescription>“{deleting?.title}” será removido permanentemente.{deleting?.kind==='task'?' As subtarefas, comentários e vínculos de anexos desta tarefa também serão removidos. Clientes e outras tarefas serão mantidos.':' A tarefa principal será mantida.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={mutating}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={mutating} onClick={e=>{e.preventDefault();void executeDelete()}}>Confirmar exclusão</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title" className="text-muted-foreground text-sm">Título *</Label>
              <Input id="task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" placeholder="Ex: Criar campanha Black Friday" />
            </div>
            <div><Label htmlFor="task-assignee">Responsável</Label><Input id="task-assignee" placeholder="Nome do responsável" maxLength={120} list="task-assignees" value={form.assignee_name} onChange={e=>setForm({...form,assignee_name:e.target.value})}/><datalist id="task-assignees">{[...new Set(tasks.map(t=>t.assignee_name).filter(Boolean))].map(name=><option key={name} value={name}/>)}</datalist><p className="text-xs text-muted-foreground mt-1">Identifica quem cuida da entrega. O acesso à conta permanece o mesmo.</p></div>
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
                  {clients.filter(c => c.status === 'Ativo' || c.id === form.client_id).map(c => (
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
                    max={1000}
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
            <Button disabled={saving} onClick={save} className="w-full neon-glow">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
