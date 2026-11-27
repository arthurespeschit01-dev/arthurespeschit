// Chamadas do front para a função asaas-sync
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type EstadoAsaas = {
  habilitado: boolean; ambiente?: string; webhook?: boolean; conta_nome?: string | null; legado?: boolean; pode_configurar?: boolean;
};
let cache: Promise<EstadoAsaas> | null = null;
const ouvintes = new Set<(e: EstadoAsaas) => void>();

const buscar = () =>
  supabase.functions
    .invoke('asaas-sync', { body: { action: 'disponivel' } })
    .then(({ data }) => ({ habilitado: !!data?.habilitado, ...(data || {}) }) as EstadoAsaas)
    .catch(() => ({ habilitado: false }));

// Recarrega o estado da conexão em todas as telas abertas
export async function atualizarAsaas() {
  cache = buscar();
  const e = await cache;
  ouvintes.forEach((f) => f(e));
  return e;
}

// Estado da conexão com o Asaas da agência do usuário
export function useAsaasDisponivel(): EstadoAsaas & { carregando: boolean } {
  const [estado, setEstado] = useState<EstadoAsaas>({ habilitado: false });
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    cache ||= buscar();
    let vivo = true;
    const ouvir = (e: EstadoAsaas) => vivo && setEstado(e);
    ouvintes.add(ouvir);
    cache.then((d) => { if (vivo) { setEstado(d); setCarregando(false); } });
    return () => { vivo = false; ouvintes.delete(ouvir); };
  }, []);
  return { ...estado, carregando };
}

export async function conectarAsaas(apiKey: string, ambiente: 'sandbox' | 'production') {
  const { data, error } = await supabase.functions.invoke('asaas-sync', { body: { action: 'conectar', api_key: apiKey, ambiente } });
  if (error || !data?.ok) throw new Error(data?.error || 'Não foi possível conectar ao Asaas.');
  await atualizarAsaas();
  return data as { ambiente: string; conta_nome: string | null };
}

export async function desconectarAsaas() {
  const { data, error } = await supabase.functions.invoke('asaas-sync', { body: { action: 'desconectar' } });
  if (error || !data?.ok) throw new Error(data?.error || 'Não foi possível desconectar.');
  await atualizarAsaas();
}

// Marcar/desmarcar pago: atualiza o Asaas (quando a cobrança é de lá) e a Central
export async function baixaAsaas(mensalidadeId: string, pago: boolean) {
  const { data, error } = await supabase.functions.invoke('asaas-sync', { body: { action: 'baixa', mensalidade_id: mensalidadeId, pago } });
  if (error || !data?.ok) throw new Error(data?.error || 'Não foi possível atualizar o pagamento.');
  return data as { status: 'pago' | 'pendente'; data_pagamento: string | null };
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
