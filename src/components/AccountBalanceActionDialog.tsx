import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle, ExternalLink, CreditCard, BarChart3 } from 'lucide-react';
import type { AccountBalance, BalanceStatus } from './AccountBalancesPanel';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: AccountBalance | null;
  status: BalanceStatus | null;
}

function fmtMoney(v: number | undefined | null, currency = 'BRL') {
  if (v === undefined || v === null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

/** Remove prefixo "act_" para usar nas URLs da Meta */
function rawAccountId(id: string): string {
  return String(id || '').replace(/^act_/, '');
}

export default function AccountBalanceActionDialog({ open, onOpenChange, account, status }: Props) {
  if (!account || !status) return null;

  const isEmpty = status === 'empty';
  const isLow = status === 'low';
  const accId = rawAccountId(account.account_id);
  const balance = account.available_balance ?? account.balance ?? 0;

  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accId}`;
  // URL da central de cobrança. Quando temos o business_id da conta, usamos o
  // billing_hub canônico (que precisa dele). Sem business_id, caímos na URL
  // do Ads Manager com âncora de billing — funciona em qualquer conta.
  const billingUrl = account.business_id
    ? `https://business.facebook.com/billing_hub/accounts/details/?asset_id=${accId}&business_id=${account.business_id}&placement=ads_manager`
    : `https://adsmanager.facebook.com/adsmanager/manage/billing?act=${accId}`;

  const Icon = isEmpty ? XCircle : AlertTriangle;
  const headerColor = isEmpty
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  const dotColor = isEmpty ? 'bg-red-500' : 'bg-amber-500';
  const statusLabel = isEmpty ? 'Sem saldo' : 'Saldo baixo';

  const title = isEmpty
    ? '🚨 Conta sem saldo'
    : '⚠️ Atenção: saldo insuficiente';

  const subtitle = isEmpty
    ? 'Essa conta provavelmente já parou de rodar campanhas.'
    : 'Essa conta pode parar de rodar a qualquer momento.';

  const ctaHint = isEmpty
    ? 'Adicione saldo agora para reativar as campanhas.'
    : 'Evite que suas campanhas parem — adicione saldo preventivamente.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${headerColor} mb-1`}>
            <div className="w-10 h-10 rounded-full bg-background/30 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5 text-current/80">
                {subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Info da conta */}
        <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conta</p>
            <p className="text-sm font-semibold text-foreground">
              {account.account_name || 'Sem nome'}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">act_{accId}</p>
            {account.client_name && account.client_name !== '—' && (
              <p className="text-[11px] text-muted-foreground mt-0.5">Cliente: {account.client_name}</p>
            )}
          </div>

          <div className="flex items-end justify-between gap-3 pt-2 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo atual</p>
              <p className={`text-2xl font-bold tabular-nums ${isEmpty ? 'text-red-400' : 'text-amber-400'}`}>
                {fmtMoney(balance, account.currency)}
              </p>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${headerColor}`}>
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{statusLabel}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center px-2">
          {ctaHint}
        </p>

        {/* Ações */}
        <div className="flex flex-col gap-2">
          <Button
            asChild
            size="lg"
            className={
              isEmpty
                ? 'w-full bg-red-500 hover:bg-red-500/90 text-white gap-2'
                : 'w-full bg-amber-500 hover:bg-amber-500/90 text-white gap-2'
            }
          >
            <a href={billingUrl} target="_blank" rel="noopener noreferrer">
              <CreditCard className="w-4 h-4" />
              Ir para Pagamentos
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </Button>
          <p className="text-[11px] text-muted-foreground text-center -mt-1">
            Adicionar saldo / ver cobrança
          </p>

          <Button asChild variant="outline" size="lg" className="w-full gap-2 mt-1">
            <a href={adsManagerUrl} target="_blank" rel="noopener noreferrer">
              <BarChart3 className="w-4 h-4" />
              Abrir Gerenciador de Anúncios
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </Button>
          <p className="text-[11px] text-muted-foreground text-center -mt-1">
            Acessar campanhas dessa conta
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
