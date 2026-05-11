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
  const [importStep, setImportStep] = useState<'idle' | 'campaigns' | 'children'>('idle');
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!importing || !importStartedAt) { setElapsed(0); return; }
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - importStartedAt) / 1000)), 500);
    return () => clearInterval(i);
  }, [importing, importStartedAt]);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('meta_connections')
      .select('selected_ad_account_id, selected_ad_account_name, token_expires_at')
      .eq('client_id', clientId).maybeSingle();
    setConnection(data);
    if (data) {
      // Renovação silenciosa do token longo (60d) se faltar < 7 dias
      supabase.functions.invoke('meta-token-refresh', { body: { client_id: clientId, threshold_days: 7 } })
        .then(({ data: r }) => {
          if (r?.refreshed && r?.token_expires_at) {
            setConnection(prev => prev ? { ...prev, token_expires_at: r.token_expires_at } : prev);
          }
        })
        .catch(() => { /* silencioso */ });
      await loadAccounts();
    }
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

    // Importação automática inicial: campanhas → conjuntos + criativos (em paralelo)
    setImporting(true);
    setImportStartedAt(Date.now());
    setImportStep('campaigns');
    toast.loading('Etapa 1/2 — Carregando campanhas da Meta...', { id: 'meta-import' });
    const { data: imp, error: impErr } = await supabase.functions.invoke('meta-import-campaigns', {
      body: { client_id: clientId },
    });
    if (impErr || imp?.error) {
      setImporting(false);
      setImportStep('idle');
      setImportStartedAt(null);
      toast.error('Falha ao importar campanhas', { id: 'meta-import' });
      return;
    }
    setImportStep('children');
    toast.loading(
      `Etapa 2/2 — ${imp?.imported ?? 0} campanhas ok. Carregando conjuntos e criativos...`,
      { id: 'meta-import' }
    );
    const [adsetsRes, creativesRes] = await Promise.allSettled([
      supabase.functions.invoke('meta-import-adsets', { body: { client_id: clientId } }),
      supabase.functions.invoke('meta-import-creatives', { body: { client_id: clientId } }),
    ]);
    const adsetsCount = adsetsRes.status === 'fulfilled' ? (adsetsRes.value.data?.imported ?? 0) : 0;
    const creativesCount = creativesRes.status === 'fulfilled' ? (creativesRes.value.data?.imported ?? 0) : 0;
    setImporting(false);
    setImportStep('idle');
    setImportStartedAt(null);
    toast.success(
      `${imp?.imported ?? 0} campanhas, ${adsetsCount} conjuntos e ${creativesCount} criativos importados`,
      { id: 'meta-import' }
    );
    onCampaignsImported?.();
  };

  const refresh = async () => {
    if (!connection?.selected_ad_account_id) {
      await loadAccounts();
      toast.success('Lista de contas atualizada');
      return;
    }
    setImporting(true);
    setImportStartedAt(Date.now());
    setImportStep('campaigns');
    toast.loading('Etapa 1/2 — Importando campanhas (pode levar 1–2 min)...', { id: 'meta-refresh' });
    const { data: imp, error: impErr } = await supabase.functions.invoke('meta-import-campaigns', {
      body: { client_id: clientId },
    });
    if (impErr || imp?.error) {
      setImporting(false);
      setImportStep('idle');
      setImportStartedAt(null);
      toast.error('Falha ao atualizar campanhas', { id: 'meta-refresh' });
      return;
    }
    // Etapa 2: conjuntos + criativos em paralelo (ambos dependem das campanhas, mas são independentes entre si)
    setImportStep('children');
    toast.loading(
      `Etapa 2/2 — ${imp?.imported ?? 0} campanhas ok. Importando conjuntos e criativos em paralelo...`,
      { id: 'meta-refresh' }
    );
    const [adsetsRes, creativesRes] = await Promise.allSettled([
      supabase.functions.invoke('meta-import-adsets', { body: { client_id: clientId } }),
      supabase.functions.invoke('meta-import-creatives', { body: { client_id: clientId } }),
    ]);
    const adsetsCount = adsetsRes.status === 'fulfilled' ? (adsetsRes.value.data?.imported ?? 0) : 0;
    const creativesCount = creativesRes.status === 'fulfilled' ? (creativesRes.value.data?.imported ?? 0) : 0;
    const partialFail = adsetsRes.status === 'rejected' || creativesRes.status === 'rejected'
      || (adsetsRes.status === 'fulfilled' && adsetsRes.value.error)
      || (creativesRes.status === 'fulfilled' && creativesRes.value.error);

    setImporting(false);
    setImportStep('idle');
    setImportStartedAt(null);
    const summary = `${imp?.imported ?? 0} campanhas, ${adsetsCount} conjuntos e ${creativesCount} criativos atualizados`;
    if (partialFail) {
      toast.warning(`${summary} (algumas falhas)`, { id: 'meta-refresh' });
    } else {
      toast.success(summary, { id: 'meta-refresh' });
    }
    await loadAccounts();
    onCampaignsImported?.();
  };

  const clearMetaData = async () => {
    const { data: camps } = await supabase.from('campaigns').select('id').eq('client_id', clientId).eq('source', 'meta');
    const campIds = (camps || []).map((c: any) => c.id);
    if (campIds.length) {
      await supabase.from('creatives').delete().in('campaign_id', campIds);
      await supabase.from('ad_sets').delete().in('campaign_id', campIds);
    }
    await supabase.from('campaigns').delete().eq('client_id', clientId).eq('source', 'meta');
  };

  const switchAccount = async () => {
    if (!confirm('Trocar de conta? Os dados importados (campanhas, conjuntos e criativos) da conta atual serão removidos e você poderá selecionar outra.')) return;
    const { error } = await supabase.from('meta_connections')
      .update({ selected_ad_account_id: null, selected_ad_account_name: null })
      .eq('client_id', clientId);
    if (error) { toast.error('Falha ao trocar conta'); return; }
    await clearMetaData();
    toast.success('Conta desvinculada. Selecione outra abaixo.');
    await loadConnection();
    onCampaignsImported?.();
  };

  const disconnectAccount = async () => {
    if (!confirm('Desconectar esta conta? Os dados importados (campanhas, conjuntos e criativos) serão removidos.')) return;
    const { error } = await supabase.from('meta_connections')
      .update({ selected_ad_account_id: null, selected_ad_account_name: null })
      .eq('client_id', clientId);
    if (error) { toast.error('Falha ao desconectar conta'); return; }
    await clearMetaData();
    toast.success('Conta desconectada e dados removidos');
    await loadConnection();
    onCampaignsImported?.();
  };

  const disconnectMetaFully = async () => {
    if (!confirm('Desconectar Meta totalmente? Token e todos os dados importados serão removidos.')) return;
    const { error } = await supabase.from('meta_connections')
      .delete()
      .eq('client_id', clientId);
    if (error) { toast.error('Falha ao desconectar Meta'); return; }
    await clearMetaData();
    toast.success('Meta desconectada e dados removidos');
    setAccounts([]);
    setConnection(null);
    onCampaignsImported?.();
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

  const expAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  const daysLeft = expAt ? (expAt.getTime() - Date.now()) / 86400000 : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const expiringSoon = !expired && daysLeft !== null && daysLeft < 7;
  const statusLabel = expired
    ? 'Token expirado'
    : expiringSoon
      ? `Expira em ${Math.max(1, Math.ceil(daysLeft!))} dia(s)`
      : 'Meta Ads conectado';
  const statusDotClass = expired ? 'bg-destructive' : expiringSoon ? 'bg-amber-400' : 'bg-emerald-400';
  const statusBgClass = expired ? 'bg-destructive/10' : expiringSoon ? 'bg-amber-400/10' : 'bg-emerald-500/10';

  return (
    <div className="space-y-4">
      <div className="glass-surface rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusBgClass}`}>
            {expired ? <AlertCircle className="w-5 h-5 text-destructive" /> : <CheckCircle2 className={`w-5 h-5 ${expiringSoon ? 'text-amber-400' : 'text-emerald-400'}`} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${statusDotClass} ${expiringSoon ? 'animate-pulse' : ''}`} />
              {statusLabel}
            </p>
            {connection.selected_ad_account_name ? (
              <p className="text-xs text-muted-foreground">Conta ativa: {connection.selected_ad_account_name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Selecione uma conta de anúncio abaixo</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={importing} className="gap-1">
            <RefreshCw className={`w-3 h-3 ${importing ? 'animate-spin' : ''}`} /> Atualizar dados
          </Button>
          {(expired || expiringSoon) && <Button size="sm" onClick={connect} disabled={connecting}>Reconectar Meta Ads</Button>}
          {connection.selected_ad_account_id && (
            <Button variant="ghost" size="sm" onClick={switchAccount} className="text-muted-foreground hover:text-foreground">Trocar conta</Button>
          )}
          <Button variant="ghost" size="sm" onClick={disconnectMetaFully} className="text-destructive">Desconectar Meta totalmente</Button>
        </div>
      </div>

      {!connection.selected_ad_account_id && (

      {importing && (
        <div className="glass-surface rounded-xl p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">
                {importStep === 'campaigns'
                  ? 'Etapa 1/2 — Importando campanhas da Meta'
                  : 'Etapa 2/2 — Importando conjuntos e criativos (em paralelo)'}
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-primary/70 to-primary bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite] rounded-full"
              style={{ width: importStep === 'campaigns' ? '50%' : '100%', transition: 'width 0.6s ease' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Esta operação pode demorar de 3 a 5 minutos para contas com muitas campanhas. Não feche esta página.
          </p>
        </div>
      )}

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
          <div className="mt-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 p-5 overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="relative w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="import-pulse-ring" />
                <span className="import-pulse-ring" style={{ animationDelay: '0.6s' }} />
                <RefreshCw className="w-5 h-5 text-primary animate-spin" style={{ animationDuration: '1.6s' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Sincronizando com a Meta
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary import-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary import-dot" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary import-dot" style={{ animationDelay: '0.3s' }} />
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Importando campanhas, conjuntos e criativos…</p>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-muted-foreground">
                <Megaphone className="w-5 h-5 import-float" />
                <BarChart3 className="w-5 h-5 import-float" style={{ animationDelay: '0.4s' }} />
                <ImageIcon className="w-5 h-5 import-float" style={{ animationDelay: '0.8s' }} />
              </div>
            </div>
            <div className="import-bar relative mt-4 h-1.5 w-full rounded-full bg-muted/60 overflow-hidden" />
          </div>
        )}
      </div>
    </div>
  );
}
