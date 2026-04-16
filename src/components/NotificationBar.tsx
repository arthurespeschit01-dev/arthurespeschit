import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, X, AlertTriangle, Clock, FileText, ChevronDown, ChevronUp, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Notification {
  id: string;
  type: 'task_overdue' | 'task_due_today' | 'task_due_soon' | 'contract_expiring' | 'contract_expired';
  title: string;
  description: string;
  route: string;
  priority: number; // lower = more urgent
}

export default function NotificationBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const sevenDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      const sevenDaysStr = `${sevenDays.getFullYear()}-${String(sevenDays.getMonth() + 1).padStart(2, '0')}-${String(sevenDays.getDate()).padStart(2, '0')}`;
      const thirtyDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
      const thirtyDaysStr = `${thirtyDays.getFullYear()}-${String(thirtyDays.getMonth() + 1).padStart(2, '0')}-${String(thirtyDays.getDate()).padStart(2, '0')}`;

      const [{ data: tasks }, { data: contracts }] = await Promise.all([
        supabase.from('operational_tasks').select('id, title, end_date, status').eq('user_id', user.id),
        supabase.from('signed_contracts').select('id, title, client_name, expiry_date, status').eq('user_id', user.id),
      ]);

      const notifs: Notification[] = [];

      const daysUntil = (dateStr: string) => {
        const target = new Date(dateStr + 'T00:00:00');
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      };

      // Task notifications
      (tasks || []).forEach(t => {
        if (t.status === 'concluída' || t.status === 'cancelada' || !t.end_date) return;
        const days = daysUntil(t.end_date);
        if (t.end_date < todayStr) {
          notifs.push({ id: `task-overdue-${t.id}`, type: 'task_overdue', title: `Task vencida: ${t.title}`, description: `Venceu em ${new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/tasks', priority: 0 });
        } else if (t.end_date === todayStr) {
          notifs.push({ id: `task-today-${t.id}`, type: 'task_due_today', title: `Task vence hoje: ${t.title}`, description: 'O prazo é hoje!', route: '/tasks', priority: 1 });
        } else if (t.end_date <= sevenDaysStr) {
          notifs.push({ id: `task-soon-${t.id}`, type: 'task_due_soon', title: `Task vence em ${days} dia${days > 1 ? 's' : ''}: ${t.title}`, description: `Vence em ${new Date(t.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/tasks', priority: 2 });
        }
      });

      // Contract notifications
      (contracts || []).forEach(c => {
        if (c.status === 'Cancelado' || c.status === 'Encerrado' || !c.expiry_date) return;
        const days = daysUntil(c.expiry_date);
        if (c.expiry_date < todayStr) {
          notifs.push({ id: `contract-expired-${c.id}`, type: 'contract_expired', title: `Contrato vencido: ${c.title}`, description: `${c.client_name} — venceu em ${new Date(c.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/contratos', priority: 0 });
        } else if (c.expiry_date <= thirtyDaysStr) {
          notifs.push({ id: `contract-expiring-${c.id}`, type: 'contract_expiring', title: `Contrato vence em ${days} dias: ${c.title}`, description: `${c.client_name} — vence em ${new Date(c.expiry_date + 'T00:00:00').toLocaleDateString('pt-BR')}`, route: '/contratos', priority: 2 });
        }
      });

      // Sort by priority (most urgent first)
      notifs.sort((a, b) => a.priority - b.priority);
      setNotifications(notifs);

      // Show toast alerts on first load for urgent items
      if (!toastShownRef.current && notifs.length > 0) {
        toastShownRef.current = true;
        const overdueItems = notifs.filter(n => n.priority === 0);
        const todayItems = notifs.filter(n => n.priority === 1);

        if (overdueItems.length > 0) {
          toast.error(`🚨 ${overdueItems.length} item(ns) vencido(s)!`, {
            description: 'Verifique suas notificações para mais detalhes.',
            duration: 6000,
          });
        } else if (todayItems.length > 0) {
          toast.warning(`⏰ ${todayItems.length} item(ns) vencem hoje!`, {
            description: 'Clique no sino para ver detalhes.',
            duration: 5000,
          });
        }
      }
    };

    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const visible = notifications.filter(n => !dismissed.has(n.id));
  const overdueCount = visible.filter(n => n.type === 'task_overdue' || n.type === 'contract_expired').length;
  const warningCount = visible.filter(n => n.type !== 'task_overdue' && n.type !== 'contract_expired').length;

  const getIcon = (type: Notification['type']) => {
    if (type === 'task_overdue' || type === 'contract_expired') return <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />;
    if (type === 'task_due_today') return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
    if (type === 'contract_expiring') return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
    return <Clock className="w-4 h-4 text-[hsl(var(--neon-blue))] shrink-0" />;
  };

  const getBg = (type: Notification['type']) => {
    if (type === 'task_overdue' || type === 'contract_expired') return 'bg-destructive/10 border-destructive/20';
    if (type === 'task_due_today') return 'bg-amber-400/10 border-amber-400/20';
    return 'bg-[hsl(var(--neon-blue))]/10 border-[hsl(var(--neon-blue))]/20';
  };

  const getLabel = (type: Notification['type']) => {
    if (type === 'task_overdue') return 'VENCIDA';
    if (type === 'task_due_today') return 'HOJE';
    if (type === 'task_due_soon') return 'EM BREVE';
    if (type === 'contract_expired') return 'VENCIDO';
    if (type === 'contract_expiring') return 'EXPIRANDO';
    return '';
  };

  const getLabelColor = (type: Notification['type']) => {
    if (type === 'task_overdue' || type === 'contract_expired') return 'bg-destructive/20 text-destructive text-[9px]';
    if (type === 'task_due_today') return 'bg-amber-500/20 text-amber-400 text-[9px]';
    return 'bg-primary/20 text-primary text-[9px]';
  };

  if (visible.length === 0) return (
    <div className="relative">
      <button className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-muted-foreground cursor-default">
        <Bell className="w-4 h-4" />
        <CheckCheck className="w-3 h-3" />
      </button>
    </div>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
          overdueCount > 0
            ? 'bg-destructive/10 border-destructive/30 hover:bg-destructive/20 animate-pulse'
            : 'bg-secondary/50 border-border/50 hover:bg-secondary'
        }`}
      >
        <Bell className={`w-4 h-4 ${overdueCount > 0 ? 'text-destructive' : 'text-foreground'}`} />
        {overdueCount > 0 && (
          <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0 h-4 min-w-4">{overdueCount}</Badge>
        )}
        {warningCount > 0 && (
          <Badge className="bg-amber-500 text-background text-[10px] px-1.5 py-0 h-4 min-w-4">{warningCount}</Badge>
        )}
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-xl bg-card border border-border shadow-2xl flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Notificações</span>
                <Badge variant="outline" className="text-[10px] px-1.5 h-4">{visible.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => { setDismissed(new Set(notifications.map(n => n.id))); setOpen(false); }}>
                Limpar tudo
              </Button>
            </div>

            {/* Summary bar */}
            {(overdueCount > 0 || visible.some(n => n.type === 'task_due_today')) && (
              <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-[11px] shrink-0">
                {overdueCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    <AlertTriangle className="w-3 h-3" /> {overdueCount} vencido(s)
                  </span>
                )}
                {overdueCount > 0 && visible.some(n => n.type === 'task_due_today') && <span className="text-border">•</span>}
                {visible.some(n => n.type === 'task_due_today') && (
                  <span className="flex items-center gap-1 text-amber-400 font-medium">
                    <Clock className="w-3 h-3" /> {visible.filter(n => n.type === 'task_due_today').length} vence(m) hoje
                  </span>
                )}
              </div>
            )}

            <div className="p-2 space-y-1.5 overflow-y-auto flex-1">
              {visible.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md ${getBg(n.type)}`}
                  onClick={() => { navigate(n.route); setOpen(false); }}
                >
                  {getIcon(n.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-foreground truncate flex-1">{n.title}</p>
                      <span className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${getLabelColor(n.type)}`}>
                        {getLabel(n.type)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{n.description}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDismissed(prev => new Set([...prev, n.id])); }}
                    className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
