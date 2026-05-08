import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, X, AlertTriangle, Clock, FileText, ChevronUp, CheckCheck, Eye, EyeOff, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useClientsQuery, useTasksQuery, useContractsQuery, useNotificationStatesQuery } from '@/hooks/queries/useSharedData';

interface Notification {
  id: string;
  type: 'task_overdue' | 'task_due_today' | 'task_due_soon' | 'contract_expiring' | 'contract_expired' | 'payment_today' | 'payment_soon';
  title: string;
  description: string;
  route: string;
  priority: number;
}

export default function NotificationBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'unread' | 'read'>('unread');
  const toastShownRef = useRef(false);
  const statesLoadedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevUnreadCountRef = useRef<number | null>(null);
  const [bellShake, setBellShake] = useState(false);

  const playNotificationSound = useCallback(() => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch { /* ignore */ }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Carrega estados via React Query (compartilhado com outras telas, sem refetch duplicado)
  const { data: notifStates } = useNotificationStatesQuery();
  useEffect(() => {
    if (!notifStates) return;
    const r = new Set<string>();
    const d = new Set<string>();
    notifStates.forEach(row => {
      if (row.status === 'read') r.add(row.notification_id);
      if (row.status === 'dismissed') d.add(row.notification_id);
    });
    setReadIds(r);
    setDismissedIds(d);
    statesLoadedRef.current = true;
  }, [notifStates]);

  // Persist a state change
  const persistState = useCallback(async (notificationId: string, status: 'read' | 'dismissed') => {
    if (!user) return;
    await supabase.from('notification_states').upsert(
      { user_id: user.id, notification_id: notificationId, status },
      { onConflict: 'user_id,notification_id' }
    );
  }, [user]);

  // Remove a persisted state (mark as unread)
  const removeState = useCallback(async (notificationId: string) => {
    if (!user) return;
    await supabase.from('notification_states')
      .delete()
      .eq('user_id', user.id)
      .eq('notification_id', notificationId);
  }, [user]);

  // Bulk persist
  const persistBulk = useCallback(async (ids: string[], status: 'read' | 'dismissed') => {
    if (!user || ids.length === 0) return;
    const rows = ids.map(nid => ({ user_id: user.id, notification_id: nid, status }));
    await supabase.from('notification_states').upsert(rows, { onConflict: 'user_id,notification_id' });
  }, [user]);

  const removeBulk = useCallback(async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    await supabase.from('notification_states')
      .delete()
      .eq('user_id', user.id)
      .in('notification_id', ids);
  }, [user]);

  // Keep latest read/dismissed sets in refs so the loader effect doesn't
  // re-subscribe (and re-query the DB) every time the user marks something.
  const readIdsRef = useRef(readIds);
  const dismissedIdsRef = useRef(dismissedIds);
  useEffect(() => { readIdsRef.current = readIds; }, [readIds]);
  useEffect(() => { dismissedIdsRef.current = dismissedIds; }, [dismissedIds]);

  // Usa hooks compartilhados — eliminam queries duplicadas com Dashboard/Tasks/Contratos/Clientes
  const { data: tasksData } = useTasksQuery();
  const { data: contractsData } = useContractsQuery();
  const { data: clientsData } = useClientsQuery();

  useEffect(() => {
    if (!user) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sevenDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const sevenDaysStr = `${sevenDays.getFullYear()}-${String(sevenDays.getMonth() + 1).padStart(2, '0')}-${String(sevenDays.getDate()).padStart(2, '0')}`;
    const thirtyDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
    const thirtyDaysStr = `${thirtyDays.getFullYear()}-${String(thirtyDays.getMonth() + 1).padStart(2, '0')}-${String(thirtyDays.getDate()).padStart(2, '0')}`;

    const tasks = tasksData || [];
    const contracts = contractsData || [];
    const clients = clientsData || [];

    const notifs: Notification[] = [];
    const daysUntil = (dateStr: string) => {
      const target = new Date(dateStr + 'T00:00:00');
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    tasks.forEach(t => {
      if (t.status === 'concluída' || t.status === 'cancelada' || !t.end_date) return;
      const days = daysUntil(t.end_date);
      if (t.end_date < todayStr) {
        notifs.push({ id: `task-overdue-${t.id}`, type: 'task_overdue', title: `Task "${t.title}" está vencida`, description: `Venceu em ${new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/tasks', priority: 0 });
      } else if (t.end_date === todayStr) {
        notifs.push({ id: `task-today-${t.id}`, type: 'task_due_today', title: `Task "${t.title}" vence hoje`, description: 'O prazo é hoje!', route: '/tasks', priority: 1 });
      } else if (t.end_date <= sevenDaysStr) {
        notifs.push({ id: `task-soon-${t.id}`, type: 'task_due_soon', title: `Task "${t.title}" vence em ${days} dia${days > 1 ? 's' : ''}`, description: `Vence em ${new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/tasks', priority: 2 });
      }
    });

    contracts.forEach(c => {
      if (c.status === 'Cancelado' || c.status === 'Encerrado' || !c.expiry_date) return;
      const days = daysUntil(c.expiry_date);
      if (c.expiry_date < todayStr) {
        notifs.push({ id: `contract-expired-${c.id}`, type: 'contract_expired', title: `Contrato "${c.title}" está vencido`, description: `Cliente: ${c.client_name} — venceu em ${new Date(c.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/contratos', priority: 0 });
      } else if (c.expiry_date <= thirtyDaysStr) {
        notifs.push({ id: `contract-expiring-${c.id}`, type: 'contract_expiring', title: `Contrato "${c.title}" está vencendo`, description: `Cliente: ${c.client_name} — vence em ${days} dias (${new Date(c.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')})`, route: '/contratos', priority: 2 });
      }
    });

    const currentDay = now.getDate();
    clients.forEach(cl => {
      if (cl.status !== 'Ativo' || !cl.payment_day) return;
      const payDay = cl.payment_day;
      if (payDay === currentDay) {
        notifs.push({ id: `payment-today-${cl.id}`, type: 'payment_today', title: `Pagamento de "${cl.name}" é hoje`, description: `Dia ${payDay} — verifique o recebimento.`, route: `/clientes/${cl.id}`, priority: 1 });
      } else {
        const daysUntilPay = ((payDay - currentDay) + 31) % 31 || 31;
        if (daysUntilPay <= 3 && daysUntilPay > 0) {
          notifs.push({ id: `payment-soon-${cl.id}`, type: 'payment_soon', title: `Pagamento de "${cl.name}" em ${daysUntilPay} dia${daysUntilPay > 1 ? 's' : ''}`, description: `Dia ${payDay} de cada mês.`, route: `/clientes/${cl.id}`, priority: 2 });
        }
      }
    });

    notifs.sort((a, b) => a.priority - b.priority);
    setNotifications(notifs);

    if (!toastShownRef.current && statesLoadedRef.current && notifs.length > 0) {
      toastShownRef.current = true;
      const unread = notifs.filter(n => !readIdsRef.current.has(n.id) && !dismissedIdsRef.current.has(n.id));
      const overdueUnread = unread.filter(n => n.priority === 0);
      const todayUnread = unread.filter(n => n.priority === 1);
      if (overdueUnread.length > 0) {
        toast.error(`🚨 ${overdueUnread.length} item(ns) vencido(s)!`, { description: 'Verifique suas notificações.', duration: 6000 });
      } else if (todayUnread.length > 0) {
        toast.warning(`⏰ ${todayUnread.length} item(ns) vencem hoje!`, { description: 'Clique no sino para ver.', duration: 5000 });
      }
    }
  }, [user, tasksData, contractsData, clientsData]);


  const visible = useMemo(() => notifications.filter(n => !dismissedIds.has(n.id)), [notifications, dismissedIds]);
  const unreadList = useMemo(() => visible.filter(n => !readIds.has(n.id)), [visible, readIds]);
  const readList = useMemo(() => visible.filter(n => readIds.has(n.id)), [visible, readIds]);
  const unreadCount = unreadList.length;
  const overdueUnreadCount = useMemo(() => unreadList.filter(n => n.type === 'task_overdue' || n.type === 'contract_expired').length, [unreadList]);
  const currentList = tab === 'unread' ? unreadList : readList;

  // Detect new notifications: trigger shake + sound when unread count increases
  useEffect(() => {
    if (!statesLoadedRef.current) return;
    const prev = prevUnreadCountRef.current;
    if (prev !== null && unreadCount > prev) {
      setBellShake(true);
      playNotificationSound();
      const t = setTimeout(() => setBellShake(false), 1000);
      prevUnreadCountRef.current = unreadCount;
      return () => clearTimeout(t);
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, playNotificationSound]);

  const toggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readIds.has(id)) {
      setReadIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      removeState(id);
    } else {
      setReadIds(prev => new Set([...prev, id]));
      persistState(id, 'read');
    }
  };

  const markAllRead = () => {
    const ids = unreadList.map(n => n.id);
    setReadIds(prev => new Set([...prev, ...ids]));
    persistBulk(ids, 'read');
  };

  const markAllUnread = () => {
    const ids = readList.map(n => n.id);
    setReadIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    removeBulk(ids);
  };

  const clearAll = () => {
    const ids = visible.map(n => n.id);
    setDismissedIds(prev => new Set([...prev, ...ids]));
    persistBulk(ids, 'dismissed');
    setOpen(false);
  };

  const dismissOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set([...prev, id]));
    persistState(id, 'dismissed');
  };

  const getIcon = (type: Notification['type']) => {
    if (type === 'task_overdue' || type === 'contract_expired') return <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />;
    if (type === 'task_due_today' || type === 'payment_today') return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
    if (type === 'contract_expiring') return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
    if (type === 'payment_soon') return <Clock className="w-4 h-4 text-[hsl(var(--neon-blue))] shrink-0" />;
    return <Clock className="w-4 h-4 text-[hsl(var(--neon-blue))] shrink-0" />;
  };

  const getBg = (type: Notification['type'], isRead: boolean) => {
    if (isRead) return 'bg-muted/30 border-border/30 opacity-60';
    if (type === 'task_overdue' || type === 'contract_expired') return 'bg-destructive/10 border-destructive/20';
    if (type === 'task_due_today' || type === 'payment_today') return 'bg-amber-400/10 border-amber-400/20';
    return 'bg-[hsl(var(--neon-blue))]/10 border-[hsl(var(--neon-blue))]/20';
  };

  const getLabel = (type: Notification['type']) => {
    if (type === 'task_overdue') return 'VENCIDA';
    if (type === 'task_due_today') return 'HOJE';
    if (type === 'task_due_soon') return 'EM BREVE';
    if (type === 'contract_expired') return 'VENCIDO';
    if (type === 'contract_expiring') return 'EXPIRANDO';
    if (type === 'payment_today') return 'HOJE';
    if (type === 'payment_soon') return 'EM BREVE';
    return '';
  };

  const getLabelColor = (type: Notification['type']) => {
    if (type === 'task_overdue' || type === 'contract_expired') return 'bg-destructive/20 text-destructive text-[9px]';
    if (type === 'task_due_today' || type === 'payment_today') return 'bg-amber-500/20 text-amber-400 text-[9px]';
    return 'bg-primary/20 text-primary text-[9px]';
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
          overdueUnreadCount > 0
            ? 'bg-destructive/10 border-destructive/30 hover:bg-destructive/20 animate-pulse'
            : 'bg-secondary/50 border-border/50 hover:bg-secondary'
        }`}
      >
        <Bell className={`w-4 h-4 ${overdueUnreadCount > 0 ? 'text-destructive' : 'text-foreground'} ${bellShake ? 'bell-shake' : ''}`} />
        {unreadCount > 0 ? (
          <Badge className={`${overdueUnreadCount > 0 ? 'bg-destructive' : 'bg-primary'} text-primary-foreground text-[10px] px-1.5 py-0 h-4 min-w-4 notif-badge-pulse`}>
            {unreadCount}
          </Badge>
        ) : (
          <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <Bell className="w-0 h-0" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-xl bg-card border border-border shadow-2xl flex flex-col">
            <div className="p-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Notificações</span>
                </div>
                <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2 text-muted-foreground gap-1 hover:text-destructive" onClick={clearAll}>
                  <Trash2 className="w-3 h-3" /> Limpar tudo
                </Button>
              </div>

              <div className="flex items-center gap-1 mt-2 bg-muted/50 rounded-lg p-0.5">
                <button
                  onClick={() => setTab('unread')}
                  className={`flex-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    tab === 'unread' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Não lidas
                  {unreadCount > 0 && <Badge className="bg-primary text-primary-foreground text-[9px] px-1 py-0 h-3.5 min-w-3.5">{unreadCount}</Badge>}
                </button>
                <button
                  onClick={() => setTab('read')}
                  className={`flex-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    tab === 'read' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Lidas
                  {readList.length > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 min-w-3.5">{readList.length}</Badge>}
                </button>
              </div>

              <div className="flex items-center gap-1 mt-2">
                {tab === 'unread' && unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2 text-muted-foreground gap-1" onClick={markAllRead}>
                    <Eye className="w-3 h-3" /> Marcar todas como lidas
                  </Button>
                )}
                {tab === 'read' && readList.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2 text-muted-foreground gap-1" onClick={markAllUnread}>
                    <EyeOff className="w-3 h-3" /> Marcar todas como não lidas
                  </Button>
                )}
              </div>
            </div>

            {currentList.length === 0 ? (
              <div className="p-6 text-center">
                <CheckCheck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {tab === 'unread' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação lida'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5 overflow-y-auto flex-1">
                {currentList.map(n => {
                  const isRead = readIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md ${getBg(n.type, isRead)}`}
                      onClick={() => { navigate(n.route); setOpen(false); }}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        {!isRead && <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-primary" />}
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-medium flex-1 ${isRead ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</p>
                          <span className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${getLabelColor(n.type)}`}>
                            {getLabel(n.type)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{n.description}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={(e) => toggleRead(n.id, e)}
                          className="text-muted-foreground hover:text-foreground"
                          title={isRead ? 'Marcar como não lida' : 'Marcar como lida'}
                        >
                          {isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => dismissOne(n.id, e)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      )}
    </div>
  );
}
