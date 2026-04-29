import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Wallet, AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AccountBalance {
  client_id: string;
  client_name: string;
  account_id: string;
  account_name: string;
  currency?: string;
  balance?: number;
  spend_cap?: number;
  amount_spent?: number;
  remaining?: number;
  account_status?: number;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const THRESHOLD_KEY = 'meta_balance_threshold';

function getStatus(a: AccountBalance, threshold: number): 'ok' | 'low' | 'empty' | 'error' {
  if (a.error) return 'error';
  if (a.account_status && a.account_status !== 1) return 'empty';
  const r = a.remaining ?? 0;
  if (r <= 0) return 'empty';
  if (r < threshold) return 'low';
  return 'ok';
}

const STATUS_CONFIG = {
  ok: { label: 'OK', icon: CheckCircle2, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500', order: 3 },
  low: { label: 'Acabando', icon: AlertTriangle, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-500', order: 1 },
  empty: { label: 'Sem saldo', icon: XCircle, color: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-500', order: 0 },
  error: { label: 'Erro', icon: AlertCircle, color: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-500', order: 0 },
};

export default function AccountBalancesDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [threshold, setThreshold] = useState<number>(() => {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isFinite(v) && v > 0 ? v : 50;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('meta-account-balances', { body: {} });
    setLoading(false);
    if (error) {
      toast.error('Falha ao carregar saldos');
      return;
    }
    setAccounts(data?.accounts || []);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => { localStorage.setItem(THRESHOLD_KEY, String(threshold)); }, [threshold]);

  const sorted = [...accounts].sort((a, b) => {
    const sa = STATUS_CONFIG[getStatus(a, threshold)].order;
    const sb = STATUS_CONFIG[getStatus(b, threshold)].order;
    if (sa !== sb) return sa - sb;
    return (a.remaining ?? 0) - (b.remaining ?? 0);
  });

  const fmt = (v: number | undefined, currency = 'BRL') => {
    if (v === undefined || v === null) return '—';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
    } catch {
      return `R$ ${v.toFixed(2)}`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" /> Saldos das Contas de Anúncio
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 p-3 bg-secondary/30 rounded-lg border border-border/50">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-muted-foreground text-xs">Limite mínimo (R$)</Label>
            <Input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              className="bg-secondary/50 border-border/50 mt-1 text-sm h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Abaixo disso → status "Acabando"</p>
          </div>
          <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Recarregar
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhuma conta de anúncio conectada com cliente ativo.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((a) => {
              const st = getStatus(a, threshold);
              const cfg = STATUS_CONFIG[st];
              const Icon = cfg.icon;
              return (
                <div key={a.account_id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${cfg.color}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {a.client_name} <span className="text-xs text-muted-foreground font-normal">• {a.account_name || a.account_id}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{a.account_id}</p>
                      {a.error && <p className="text-[11px] text-red-400 mt-0.5">{a.error}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 justify-end mb-0.5">
                      <Icon className="w-3 h-3" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">{cfg.label}</span>
                    </div>
                    {!a.error && (
                      <>
                        <p className="text-sm font-bold text-foreground">{fmt(a.remaining, a.currency)}</p>
                        {a.spend_cap && a.spend_cap > 0 && (
                          <p className="text-[10px] text-muted-foreground">Cap: {fmt(a.spend_cap, a.currency)}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
