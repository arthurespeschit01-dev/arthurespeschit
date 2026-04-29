import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type EntityType = 'campaign' | 'adset' | 'ad';

interface Props {
  clientId: string;
  entityType: EntityType;
  metaId: string | null | undefined;
  status: string | undefined;
  onChanged?: (newStatus?: string) => void;
}

const LABEL: Record<EntityType, string> = {
  campaign: 'campanha',
  adset: 'conjunto',
  ad: 'anúncio',
};

function isActive(status?: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'ACTIVE' || /ATIV/i.test(status);
}
function isArchived(status?: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'ARCHIVED' || s === 'DELETED' || /ARQUIVAD|ENCERRAD/i.test(status);
}

export default function EntityStatusToggle({ clientId, entityType, metaId, status, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const active = isActive(status);
  const archived = isArchived(status);

  if (!metaId) return null;

  const run = async (action: 'pause' | 'activate') => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('meta-entity-action', {
      body: { client_id: clientId, entity_type: entityType, meta_id: metaId, action },
    });
    setLoading(false);
    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Erro ao executar';
      toast.error(`Falha: ${msg}`);
      return;
    }
    toast.success(`${LABEL[entityType]} ${action === 'pause' ? 'pausada' : 'ativada'}`);
    onChanged?.(action === 'pause' ? 'PAUSED' : 'ACTIVE');
  };

  const handleChange = (next: boolean) => {
    if (loading || archived) return;
    if (!next) setConfirmPause(true); // pausando — pede confirmação
    else run('activate');
  };

  return (
    <>
      <div
        className="flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={active}
            onCheckedChange={handleChange}
            disabled={archived}
            aria-label={active ? 'Pausar' : 'Ativar'}
            className="data-[state=checked]:bg-primary"
          />
        )}
      </div>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar {LABEL[entityType]}?</AlertDialogTitle>
            <AlertDialogDescription>
              A entrega será interrompida no Meta Ads. Você pode ativar de novo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmPause(false); run('pause'); }}>
              Pausar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
