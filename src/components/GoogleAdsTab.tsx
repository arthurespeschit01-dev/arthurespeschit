import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Customer { id: string; formatted: string; name: string; manager: boolean; login_customer_id?: string; }
interface Connection {
  selected_customer_id: string | null;
  selected_customer_name: string | null;
  login_customer_id: string | null;
  token_expires_at: string | null;
}
interface Campaign {
  id: string; name: string; status: string;
  impressions: number; clicks: number; ctr: number;
  average_cpc: number; cost: number;
  conversions: number; conversions_value: number;
  cpa: number; roas: number;
}

const fmtBRL = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => (v || 0).toLocaleString('pt-BR');

export default function GoogleAdsTab({ clientId }: { clientId: string }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('google_ads_connections')
      .select('selected_customer_id, selected_customer_name, login_customer_id, token_expires_at')
      .eq('client_id', clientId).maybeSingle();
    setConnection(data);
    setLoading(false);
    if (data && !data.selected_customer_id) {
      setLoadingCustomers(true);
      const { data: list } = await supabase.functions.invoke('google-ads-list-customers', { body: { client_id: clientId } });
      if (list?.customers) setCustomers(list.customers);
      setLoadingCustomers(false);
    } else {
      setCustomers([]);
    }
  }, [clientId]);

  const loadMetrics = useCallback(async () => {
    if (!connection?.selected_customer_id) return;
    setLoadingMetrics(true);
    const { data, error } = await supabase.functions.invoke('google-ads-campaign-insights', {
      body: { client_id: clientId, days },
    });
    setLoadingMetrics(false);
    if (error || data?.error) {
      toast.error('Falha ao carregar métricas do Google Ads');
      return;
    }
    setCampaigns(data?.campaigns || []);
  }, [clientId, days, connection?.selected_customer_id]);

  useEffect(() => { loadConnection(); }, [loadConnection]);
  useEffect(() => { if (connection?.selected_customer_id) loadMetrics(); }, [loadMetrics, connection?.selected_customer_id]);

  // Detecta retorno do OAuth (?google_ads=ok|err) e mostra toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_ads');
    if (!result) return;
    const stored = localStorage.getItem('google-ads-return');
    if (result === 'ok') {
      toast.success('Google Ads conectado!');
      loadConnection();
    } else {
      toast.error(params.get('msg') || 'Falha ao conectar Google Ads');
    }
    if (stored) localStorage.removeItem('google-ads-return');
    params.delete('google_ads');
    params.delete('msg');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  }, [loadConnection]);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-ads-auth?client_id=${clientId}&origin=${encodeURIComponent(returnUrl)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      if (!res.ok || !json.auth_url) throw new Error(json.error || 'Falha');
      localStorage.setItem('google-ads-return', JSON.stringify({ clientId, ts: Date.now() }));
      // Redirecionar a janela TOP-level (escapa do iframe do preview) — evita ERR_BLOCKED_BY_RESPONSE
      const target: Window = (() => { try { return window.top || window; } catch { return window; } })();
      target.location.href = json.auth_url;
    } catch (e: any) {
      toast.error(e.message || 'Falha ao iniciar OAuth');
      setConnecting(false);
    }
  };

  const selectCustomer = async (customerId: string, loginCustomerId?: string) => {
    const cleaned = customerId.replace(/\D/g, '');
    if (cleaned.length !== 10) { toast.error('Customer ID inválido'); return; }
    setSelecting(cleaned);
    const loginCleaned = (loginCustomerId || '').replace(/\D/g, '');
    const { data, error } = await supabase.functions.invoke('google-ads-list-customers', {
      body: { client_id: clientId, select_customer_id: cleaned, login_customer_id: loginCleaned || null },
    });
    setSelecting(null);
    if (error || data?.error) { toast.error('Falha ao selecionar conta'); return; }
    toast.success('Conta vinculada com sucesso');
    await loadConnection();
  };

  const disconnectCustomer = async () => {
    if (!confirm('Desconectar esta conta do Google Ads?')) return;
    await supabase.functions.invoke('google-ads-disconnect', { body: { client_id: clientId } });
    setCampaigns([]);
    await loadConnection();
  };

  const disconnectFully = async () => {
    if (!confirm('Desconectar Google Ads totalmente? O token será removido.')) return;
    await supabase.functions.invoke('google-ads-disconnect', { body: { client_id: clientId, full: true } });
    setCampaigns([]);
    setConnection(null);
    setCustomers([]);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!connection) {
    return (
      <div className="glass-surface rounded-xl p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Link2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-1">Conectar Google Ads</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Conecte a conta Google Ads deste cliente para visualizar métricas e campanhas.
          </p>
        </div>
        <Button onClick={connect} disabled={connecting} className="neon-glow gap-2">
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Conectar com Google
        </Button>
      </div>
    );
  }

  const expired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();
  const totals = campaigns.reduce((acc, c) => ({
    cost: acc.cost + c.cost,
    clicks: acc.clicks + c.clicks,
    impressions: acc.impressions + c.impressions,
    conversions: acc.conversions + c.conversions,
    revenue: acc.revenue + c.conversions_value,
  }), { cost: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 });
  const totalRoas = totals.cost > 0 ? totals.revenue / totals.cost : 0;
  const totalCpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

  return (
    <div className="space-y-4">
      <div className="glass-surface rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expired ? 'bg-destructive/10' : 'bg-emerald-500/10'}`}>
            {expired ? <AlertCircle className="w-5 h-5 text-destructive" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{expired ? 'Token expirado' : 'Google Ads conectado'}</p>
            {connection.selected_customer_name ? (
              <p className="text-xs text-muted-foreground">Conta ativa: {connection.selected_customer_name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Selecione um Customer ID abaixo</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {connection.selected_customer_id && (
            <Button variant="outline" size="sm" onClick={loadMetrics} disabled={loadingMetrics} className="gap-1">
              <RefreshCw className={`w-3 h-3 ${loadingMetrics ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          )}
          {expired && <Button size="sm" onClick={connect} disabled={connecting}>Reconectar</Button>}
          {connection.selected_customer_id && (
            <Button variant="ghost" size="sm" onClick={disconnectCustomer} className="text-destructive">Desconectar conta</Button>
          )}
          <Button variant="ghost" size="sm" onClick={disconnectFully} className="text-destructive">Desconectar totalmente</Button>
        </div>
      </div>

      {!connection.selected_customer_id && (
        <div className="glass-surface rounded-xl p-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Selecione a conta Google Ads</h4>
            <p className="text-xs text-muted-foreground">Escolha qual conta deseja vincular a este cliente. As contas abaixo são as que sua autorização permite acessar.</p>
          </div>

          {loadingCustomers ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Buscando suas contas no Google Ads…</span>
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Nenhuma conta Google Ads encontrada para este login. Verifique se você tem acesso a alguma conta em ads.google.com
              </p>
              <Button size="sm" variant="outline" onClick={connect} disabled={connecting} className="gap-1">
                {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reconectar com outra conta
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                        {c.name}
                        {c.manager && (
                          <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">MCC</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{c.formatted}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => selectCustomer(c.id, c.login_customer_id)} disabled={!!selecting} className="gap-1">
                    {selecting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Vincular
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {connection.selected_customer_id && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Período:</span>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${days === d ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}>
                {d} dias
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Investimento" value={fmtBRL(totals.cost)} />
            <MetricCard label="Cliques" value={fmtInt(totals.clicks)} />
            <MetricCard label="Impressões" value={fmtInt(totals.impressions)} />
            <MetricCard label="Conversões" value={fmtInt(totals.conversions)} highlight />
            <MetricCard label="ROAS" value={`${totalRoas.toFixed(2)}x`} highlight />
          </div>

          <div className="glass-surface rounded-xl p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Campanhas ({campaigns.length})</h4>
            {loadingMetrics ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma campanha no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border/50">
                      <th className="text-left font-medium py-2 px-2">Campanha</th>
                      <th className="text-right font-medium py-2 px-2">Status</th>
                      <th className="text-right font-medium py-2 px-2">Investido</th>
                      <th className="text-right font-medium py-2 px-2">Impr.</th>
                      <th className="text-right font-medium py-2 px-2">Cliques</th>
                      <th className="text-right font-medium py-2 px-2">CTR</th>
                      <th className="text-right font-medium py-2 px-2">CPC</th>
                      <th className="text-right font-medium py-2 px-2">Conv.</th>
                      <th className="text-right font-medium py-2 px-2">CPA</th>
                      <th className="text-right font-medium py-2 px-2">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-secondary/30">
                        <td className="py-2 px-2 text-foreground font-medium">{c.name}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground text-xs">{c.status}</td>
                        <td className="py-2 px-2 text-right text-foreground">{fmtBRL(c.cost)}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{fmtInt(c.impressions)}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{fmtInt(c.clicks)}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{c.ctr.toFixed(2)}%</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{fmtBRL(c.average_cpc)}</td>
                        <td className="py-2 px-2 text-right text-foreground">{fmtInt(c.conversions)}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{c.cpa > 0 ? fmtBRL(c.cpa) : '—'}</td>
                        <td className="py-2 px-2 text-right text-primary font-semibold">{c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/30'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
