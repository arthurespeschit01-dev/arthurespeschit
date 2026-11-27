// Chamadas do front para a função asaas-sync
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type Disponivel = { habilitado: boolean; ambiente?: string };
let cache: Promise<Disponivel> | null = null;

// A cobrança automática só aparece para a conta dona do Asaas
export function useAsaasDisponivel(): Disponivel {
  const [estado, setEstado] = useState<Disponivel>({ habilitado: false });
  useEffect(() => {
    cache ||= supabase.functions
      .invoke('asaas-sync', { body: { action: 'disponivel' } })
      .then(({ data }) => ({ habilitado: !!data?.habilitado, ambiente: data?.ambiente }))
      .catch(() => ({ habilitado: false }));
    let vivo = true;
    cache.then((d) => vivo && setEstado(d));
    return () => { vivo = false; };
  }, []);
  return estado;
}

// Sincroniza e avisa o resultado; em caso de erro oferece "Tentar de novo"
export async function sincronizarAsaas(clientId: string, depois?: () => void): Promise<boolean> {
  const id = toast.loading('Gerando cobrança no Asaas…');
  const { data, error } = await supabase.functions.invoke('asaas-sync', { body: { client_id: clientId } });
  toast.dismiss(id);
  depois?.();
  if (!error && data?.ok) {
    const feito: string[] = data.executado || [];
    toast.success(feito.length ? 'Cobrança sincronizada com o Asaas.' : 'Asaas já estava em dia.');
    return true;
  }
  const msg = data?.error || 'Não foi possível falar com o Asaas.';
  toast.error(msg, { duration: 15000, action: { label: 'Tentar de novo', onClick: () => void sincronizarAsaas(clientId, depois) } });
  return false;
}
