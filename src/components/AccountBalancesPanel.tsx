import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Loader2, RefreshCw, Wallet, AlertCircle, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

export interface AccountBalance {
  client_id: string;
  client_name: string;
  account_id: string;
  account_name: string;
  currency?: string;
  /** Saldo disponível APENAS para contas pré-pagas. `null` em pós-pagas. */
  available_balance?: number | null;
  /** Fatura em aberto (gasto não cobrado) — só preenchido em pós-pagas. */
  pending_bill?: number;
  is_prepaid?: boolean;
  funding_type?: number | null;
  funding_label?: string;
  account_status?: number;
  account_status_label?: string;
  /** Compat retroativo — não usar para decisões. */
  balance?: number;
  error?: string;
}

export type BalanceStatus = 'ok' | 'low' | 'empty' | 'error' | 'postpaid';

const LOW_THRESHOLD = 200;

export function getBalanceStatus(a: AccountBalance): BalanceStatus {
  // Erro técnico de fetch OU status problemático na Meta
  if (a.error) return 'error';
  if (a.account_status_label) return 'error';

  // Pós-paga saudável: não é "OK" verde, é estado neutro próprio
  if (a.is_prepaid === false) return 'postpaid';

  // Pré-paga: avalia saldo disponível
  const r = a.available_balance ?? a.balance ?? 0;
  if (r <= 0) return 'empty';
  if (r <= LOW_THRESHOLD) return 'low';
  return 'ok';
}

const STATUS_CONFIG = {
  ok:       { label: 'Saldo OK',           icon: CheckCircle2,  color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500', emoji: '🟢', order: 4 },
  postpaid: { label: 'Cartão de crédito',  icon: CreditCard,    color: 'bg-sky-500/10 text-sky-400 border-sky-500/30',             dot: 'bg-sky-500',     emoji: '💳', order: 3 },
  low:      { label: 'Saldo baixo',        icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       dot: 'bg-amber-500',   emoji: '🟡', order: 1 },
  empty:    { label: 'Sem saldo',          icon: XCircle,       color: 'bg-red-500/10 text-red-400 border-red-500/30',             dot: 'bg-red-500',     emoji: '🔴', order: 0 },
  error:    { label: 'Erro / Inativa',     icon: AlertCircle,   color: 'bg-red-500/10 text-red-400 border-red-500/30',             dot: 'bg-red-500',     emoji: '🔴', order: 0 },
};

/** Hook leve para somente contar contas problemáticas (badge) */
export function useAccountBalancesCount() {
  const [problemCount, setProblemCount] = useState(0);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('meta-account-balances', { body: {} });
    setLoading(false);
    if (error) return;
    const list: AccountBalance[] = data?.accounts || [];
    setAccounts(list);
    const count = list.filter(a => {
      const s = getBalanceStatus(a);
      return s === 'low' || s === 'empty' || s === 'error';
    }).length;
    setProblemCount(count);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { problemCount, accounts, loading, refresh };
}

interface PanelProps {
  defaultOpen?: boolean;
  /** Permite reutilizar dados já carregados pelo hook do badge */
  initialAccounts?: AccountBalance[];
  onAccountsChange?: (accounts: AccountBalance[]) => void;
}

export default function AccountBalancesPanel({ defaultOpen = false, initialAccounts, onAccountsChange }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountBalance[]>(initialAccounts || []);
  const [hasLoaded, setHasLoaded] = useState(!!initialAccounts?.length);

  useEffect(() => {
    if (initialAccounts && initialAccounts.length) {
      setAccounts(initialAccounts);
      setHasLoaded(true);
    }
  }, [initialAccounts]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('meta-account-balances', { body: {} });
    setLoading(false);
    if (error) {
      toast.error('Falha ao carregar saldos');
      return;
    }
    const list = data?.accounts || [];
    setAccounts(list);
    setHasLoaded(true);
    onAccountsChange?.(list);
  }, [onAccountsChange]);

  // Carrega ao abrir pela primeira vez
  useEffect(() => {
    if (open && !hasLoaded && !loading) load();
  }, [open, hasLoaded, loading, load]);

  const sorted = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const sa = STATUS_CONFIG[getBalanceStatus(a)].order;
      const sb = STATUS_CONFIG[getBalanceStatus(b)].order;
      if (sa !== sb) return sa - sb;
      return (a.balance ?? 0) - (b.balance ?? 0);
    });
  }, [accounts]);

  const problemCount = useMemo(() => accounts.filter(a => {
    const s = getBalanceStatus(a);
    return s === 'low' || s === 'empty' || s === 'error';
  }).length, [accounts]);

  const fmt = (v: number | undefined, currency = 'BRL') => {
    if (v === undefined || v === null) return '—';
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
    } catch {
      return `R$ ${v.toFixed(2)}`;
    }
  };

  return (
    <div className="glass-surface rounded-xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Saldos das Contas
              {problemCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                  {problemCount} com problema
                </span>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Verificação de saldo das contas de anúncio do Meta {hasLoaded && `• ${accounts.length} contas`}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {open && (
            <Button onClick={load} variant="outline" size="sm" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Atualizar tudo
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} className="gap-1">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="border-t border-border/50 p-4 space-y-3">

          {loading && accounts.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-lg bg-secondary/30 animate-pulse border border-border/30" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma conta de anúncio conectada com cliente ativo.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((a) => {
                const st = getBalanceStatus(a);
                const cfg = STATUS_CONFIG[st];
                const Icon = cfg.icon;
                const errMsg = a.error || a.account_status_label;
                return (
                  <div key={a.account_id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${cfg.color}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {a.account_name || 'Sem nome'}
                        </p>
                        {errMsg && <p className="text-[11px] text-red-400 mt-0.5">{errMsg}</p>}
                        {!errMsg && st === 'postpaid' && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {a.funding_label || 'Cartão de crédito'} • cobrança automática
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end mb-0.5">
                        <span className="text-xs">{cfg.emoji}</span>
                        <Icon className="w-3 h-3" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{cfg.label}</span>
                      </div>
                      {!errMsg && st === 'postpaid' ? (
                        <>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">Fatura em aberto</p>
                          <p className="text-base font-semibold text-foreground/80 leading-tight tabular-nums">
                            {fmt(a.pending_bill ?? 0, a.currency)}
                          </p>
                        </>
                      ) : !errMsg ? (
                        <p className="text-lg font-bold text-foreground leading-tight tabular-nums">
                          {fmt(a.available_balance ?? a.balance ?? 0, a.currency)}
                        </p>
                      ) : null}
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
