// Atualização automática dos dados da Meta (campanhas, conjuntos e criativos).
// Roda em segundo plano quando o sistema abre e quando um cliente é aberto,
// sempre que os dados estiverem mais velhos que o limite.
import { supabase } from '@/integrations/supabase/client';

const EM_ANDAMENTO = new Map<string, Promise<boolean>>();
const CHAVE = (id: string) => `meta-sync-${id}`;
export const META_SYNC_EVENT = 'meta-sync-done';

function ultimaSync(clientId: string): number {
  try { return Number(localStorage.getItem(CHAVE(clientId)) || 0); } catch { return 0; }
}

async function ultimaAtualizacaoBanco(clientId: string): Promise<number> {
  const { data } = await supabase.from('campaigns')
    .select('updated_at').eq('client_id', clientId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return data?.updated_at ? new Date(data.updated_at as string).getTime() : 0;
}

/** Atualiza um cliente se os dados tiverem mais de `maxMinutos`. Devolve true se atualizou. */
export function syncMetaClient(clientId: string, { maxMinutos = 30, forcar = false } = {}): Promise<boolean> {
  const atual = EM_ANDAMENTO.get(clientId);
  if (atual) return atual;
  const p = (async () => {
    const { data: con } = await supabase.from('meta_connections')
      .select('selected_ad_account_id').eq('client_id', clientId).maybeSingle();
    if (!con?.selected_ad_account_id) return false;
    if (!forcar) {
      const ref = Math.max(ultimaSync(clientId), await ultimaAtualizacaoBanco(clientId));
      if (ref && Date.now() - ref < maxMinutos * 60_000) return false;
    }
    const { data: imp, error } = await supabase.functions.invoke('meta-import-campaigns', { body: { client_id: clientId } });
    if (error || imp?.error) return false;
    await Promise.allSettled([
      supabase.functions.invoke('meta-import-adsets', { body: { client_id: clientId } }),
      supabase.functions.invoke('meta-import-creatives', { body: { client_id: clientId } }),
    ]);
    try { localStorage.setItem(CHAVE(clientId), String(Date.now())); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(META_SYNC_EVENT, { detail: { clientId } }));
    return true;
  })().finally(() => EM_ANDAMENTO.delete(clientId));
  EM_ANDAMENTO.set(clientId, p);
  return p;
}

/** Ao entrar no sistema: atualiza, um por vez, todos os clientes com conta Meta selecionada. */
export async function syncAllMetaClients(maxMinutos = 60) {
  try {
    if (sessionStorage.getItem('meta-sync-sessao')) return;
    sessionStorage.setItem('meta-sync-sessao', '1');
  } catch { /* ignore */ }
  const { data } = await supabase.from('meta_connections')
    .select('client_id, selected_ad_account_id').not('selected_ad_account_id', 'is', null);
  for (const c of data || []) {
    if (!c.client_id) continue;
    try { await syncMetaClient(c.client_id as string, { maxMinutos }); } catch { /* segue para o próximo */ }
  }
}
