import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, CheckCircle2, RefreshCw, AlertCircle, Megaphone, Image as ImageIcon, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
}

interface Connection {
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
  token_expires_at: string | null;
}

export default function MetaAdsTab({ clientId, onCampaignsImported }: { clientId: string; onCampaignsImported?: () => void }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('meta_connections')
      .select('selected_ad_account_id, selected_ad_account_name, token_expires_at')
      .eq('client_id', clientId).maybeSingle();
    setConnection(data);
    if (data) await loadAccounts();
    setLoading(false);
  }, [clientId]);

  const loadAccounts = async () => {
    const { data, error } = await supabase.functions.invoke('meta-get-ad-accounts', {
      body: { client_id: clientId },
    });
    if (error) { toast.error('Falha ao listar contas'); return; }
    if (data?.accounts) setAccounts(data.accounts);
  };

  useEffect(() => { loadConnection(); }, [loadConnection]);

  // Listener para postMessage do popup
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === 'meta-oauth') {
        if (ev.data.ok) { toast.success('Meta conectada!'); loadConnection(); }
        else toast.error('Falha ao conectar Meta');
        setConnecting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadConnection]);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-auth?client_id=${clientId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      if (!res.ok || !json.auth_url) throw new Error(json.error || 'Falha');
      const popup = window.open(json.auth_url, 'meta-oauth', 'width=600,height=700');
      if (!popup) { toast.error('Permita popups para conectar'); setConnecting(false); }
    } catch (e: any) {
      toast.error(e.message || 'Falha ao iniciar OAuth');
      setConnecting(false);
    }
  };

  const selectAccount = async (accountId: string) => {
    setSelecting(accountId);
    const { error } = await supabase.functions.invoke('meta-get-ad-accounts', {
      body: { client_id: clientId, select_account_id: accountId },
    });
    if (error) {
      toast.error('Falha ao selecionar');
      setSelecting(null);
      return;
    }
    toast.success('Conta selecionada');
    await loadConnection();
    setSelecting(null);

    // Importação automática de campanhas
    setImporting(true);
    toast.loading('Carregando campanhas da Meta...', { id: 'meta-import' });
    const { data: imp, error: impErr } = await supabase.functions.invoke('meta-import-campaigns', {
      body: { client_id: clientId },
    });
    if (impErr || imp?.error) {
      setImporting(false);
      toast.error('Falha ao importar campanhas', { id: 'meta-import' });
      return;
    }
    toast.loading('Carregando criativos da Meta...', { id: 'meta-import' });
    const { data: cre } = await supabase.functions.invoke('meta-import-creatives', {
      body: { client_id: clientId },
    });
    setImporting(false);
    toast.success(`${imp?.imported ?? 0} campanhas e ${cre?.imported ?? 0} criativos importados`, { id: 'meta-import' });
    onCampaignsImported?.();
  };

  const refresh = async () => {
    if (!connection?.selected_ad_account_id) {
      await loadAccounts();
      toast.success('Lista de contas atualizada');
      return;
    }
    setImporting(true);
    toast.loading('Atualizando campanhas e criativos...', { id: 'meta-refresh' });
    const { data: imp, error: impErr } = await supabase.functions.invoke('meta-import-campaigns', {
      body: { client_id: clientId },
    });
    if (impErr || imp?.error) {
      setImporting(false);
      toast.error('Falha ao atualizar campanhas', { id: 'meta-refresh' });
      return;
    }
    const { data: cre } = await supabase.functions.invoke('meta-import-creatives', {
      body: { client_id: clientId },
    });
    setImporting(false);
    toast.success(`${imp?.imported ?? 0} campanhas e ${cre?.imported ?? 0} criativos atualizados`, { id: 'meta-refresh' });
    await loadAccounts();
    onCampaignsImported?.();
  };

  const disconnectAccount = async () => {
    if (!confirm('Desconectar esta conta? Você poderá selecionar outra conta Meta em seguida.')) return;
    const { error } = await supabase.from('meta_connections')
      .update({ selected_ad_account_id: null, selected_ad_account_name: null })
      .eq('client_id', clientId);
    if (error) { toast.error('Falha ao desconectar conta'); return; }
    toast.success('Conta desconectada — selecione outra abaixo');
    await loadConnection();
  };

  const disconnectMetaFully = async () => {
    if (!confirm('Desconectar Meta totalmente? O token será removido e você precisará refazer a autenticação para reconectar.')) return;
    const { error } = await supabase.from('meta_connections')
      .delete()
      .eq('client_id', clientId);
    if (error) { toast.error('Falha ao desconectar Meta'); return; }
    toast.success('Meta desconectada totalmente');
    setAccounts([]);
    setConnection(null);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!connection) {
    return (
      <div className="glass-surface rounded-xl p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Link2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-1">Conectar Meta Ads</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Conecte a conta Meta deste cliente para importar campanhas reais e métricas (gasto, CPA, ROAS).</p>
        </div>
        <Button onClick={connect} disabled={connecting} className="neon-glow gap-2">
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Conectar Meta Ads
        </Button>
      </div>
    );
  }

  const expired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();

  return (
    <div className="space-y-4">
      <div className="glass-surface rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expired ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
            {expired ? <AlertCircle className="w-5 h-5 text-destructive" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{expired ? 'Token expirado' : 'Meta Ads conectado'}</p>
            {connection.selected_ad_account_name ? (
              <p className="text-xs text-muted-foreground">Conta ativa: {connection.selected_ad_account_name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Selecione uma conta de anúncio abaixo</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={importing} className="gap-1">
            <RefreshCw className={`w-3 h-3 ${importing ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          {expired && <Button size="sm" onClick={connect} disabled={connecting}>Reconectar</Button>}
          <Button variant="ghost" size="sm" onClick={disconnectAccount} className="text-destructive">Desconectar conta</Button>
          <Button variant="ghost" size="sm" onClick={disconnectMetaFully} className="text-destructive">Desconectar Meta totalmente</Button>
        </div>
      </div>

      <div className="glass-surface rounded-xl p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3">Contas de anúncio ({accounts.length})</h4>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma conta encontrada.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(a => {
              const isSelected = connection.selected_ad_account_id === a.id;
              return (
                <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${isSelected ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.id} • {a.currency}</p>
                  </div>
                  {isSelected ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ativa</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => selectAccount(a.id)} disabled={!!selecting || importing}>
                      {(selecting === a.id || (importing && connection.selected_ad_account_id === a.id)) ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Selecionar'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {importing && (
          <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Carregando campanhas da Meta...
          </p>
        )}
      </div>
    </div>
  );
}
