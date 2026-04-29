import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { MoreVertical, Pause, Play, Copy, Archive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export type EntityType = 'campaign' | 'adset' | 'ad';
type ActionType = 'pause' | 'activate' | 'archive' | 'duplicate';

interface Props {
  clientId: string;
  entityType: EntityType;
  metaId: string | null | undefined;
  status: string | undefined;
  onChanged?: (newStatus?: string) => void;
  size?: 'sm' | 'icon';
}

function isActive(status?: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'ACTIVE' || /ATIVA|ATIVO/i.test(status);
}

function isPaused(status?: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'PAUSED' || /PAUSAD/i.test(status);
}

function isArchived(status?: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'ARCHIVED' || s === 'DELETED' || /ARQUIVAD|ENCERRAD/i.test(status);
}

const ENTITY_LABEL: Record<EntityType, string> = {
  campaign: 'campanha',
  adset: 'conjunto de anúncios',
  ad: 'criativo',
};

export default function EntityActionsMenu({ clientId, entityType, metaId, status, onChanged, size = 'icon' }: Props) {
  const [loading, setLoading] = useState<ActionType | null>(null);
  const [confirm, setConfirm] = useState<ActionType | null>(null);

  if (!metaId) return null;

  const showActivate = !isActive(status);
  const showPause = isActive(status);
  const showArchive = !isArchived(status);

  const run = async (action: ActionType) => {
    setLoading(action);
    const { data, error } = await supabase.functions.invoke('meta-entity-action', {
      body: { client_id: clientId, entity_type: entityType, meta_id: metaId, action },
    });
    setLoading(null);
    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Erro ao executar ação';
      toast.error(`Falha: ${msg}`);
      return;
    }
    const labels: Record<ActionType, string> = {
      pause: 'Pausada',
      activate: 'Ativada',
      archive: 'Arquivada',
      duplicate: 'Duplicada',
    };
    toast.success(`${ENTITY_LABEL[entityType]} ${labels[action].toLowerCase()} com sucesso`);
    const newStatus = action === 'pause' ? 'PAUSED' : action === 'activate' ? 'ACTIVE' : action === 'archive' ? 'ARCHIVED' : undefined;
    onChanged?.(newStatus);
  };

  const onClick = (action: ActionType, needsConfirm: boolean) => {
    if (needsConfirm) setConfirm(action);
    else run(action);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={size === 'icon' ? 'icon' : 'sm'}
            className={size === 'icon' ? 'h-7 w-7 p-0' : 'h-7 px-2'}
            onClick={(e) => e.stopPropagation()}
            disabled={!!loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-card border-border w-44"
          onClick={(e) => e.stopPropagation()}
        >
          {showActivate && (
            <DropdownMenuItem onSelect={() => onClick('activate', false)} className="gap-2 cursor-pointer">
              <Play className="w-3.5 h-3.5 text-emerald-400" /> Ativar
            </DropdownMenuItem>
          )}
          {showPause && (
            <DropdownMenuItem onSelect={() => onClick('pause', true)} className="gap-2 cursor-pointer">
              <Pause className="w-3.5 h-3.5 text-amber-400" /> Pausar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onClick('duplicate', false)} className="gap-2 cursor-pointer">
            <Copy className="w-3.5 h-3.5 text-primary" /> Duplicar
          </DropdownMenuItem>
          {showArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onClick('archive', true)} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                <Archive className="w-3.5 h-3.5" /> Arquivar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'pause' && `Pausar ${ENTITY_LABEL[entityType]}?`}
              {confirm === 'archive' && `Arquivar ${ENTITY_LABEL[entityType]}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'pause' && 'A entrega será interrompida no Meta Ads. Você pode ativar de novo a qualquer momento.'}
              {confirm === 'archive' && 'Itens arquivados não aparecem mais nas listas padrão e não podem ser ativados sem desarquivar manualmente no Gerenciador.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) run(confirm); setConfirm(null); }}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
