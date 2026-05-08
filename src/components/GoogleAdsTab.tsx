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

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === 'google-ads-oauth') {
        if (ev.data.ok) { toast.success('Google Ads conectado!'); loadConnection(); }
        else toast.error('Falha ao conectar Google Ads');
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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-ads-auth?client_id=${clientId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      if (!res.ok || !json.auth_url) throw new Error(json.error || 'Falha');
      // Abrir em nova aba (sem features para não virar popup, evita ERR_BLOCKED_BY_RESPONSE do Google)
      const tab = window.open(json.auth_url, '_blank', 'noopener,noreferrer');
      if (!tab) {
        // Fallback: navegar a própria janela
        window.location.href = json.auth_url;
        return;
      }
      toast.info('Conclua o login do Google na nova aba — voltaremos a buscar a conexão automaticamente.');
      // Polling: verifica se a conexão chegou ao banco
      const start = Date.now();
      const poll = setInterval(async () => {
        const { data } = await supabase.from('google_ads_connections')
          .select('id').eq('client_id', clientId).maybeSingle();
        if (data) {
          clearInterval(poll);
          setConnecting(false);
          toast.success('Google Ads conectado!');
          loadConnection();
        } else if (Date.now() - start > 5 * 60 * 1000) {
          clearInterval(poll);
          setConnecting(false);
        }
      }, 2500);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao iniciar OAuth');
      setConnecting(false);
    }
  };

  const selectCustomer = async (customerId: string) => {
    const cleaned = customerId.replace(/\D/g, '');
    if (cleaned.length !== 10) { toast.error('Customer ID deve ter 10 dígitos (ex.: 123-456-7890)'); return; }
    setSelecting(cleaned);
    const loginCleaned = loginCustomerId.replace(/\D/g, '');
    const { data, error } = await supabase.functions.invoke('google-ads-list-customers', {
      body: { client_id: clientId, select_customer_id: cleaned, login_customer_id: loginCleaned || null },
    });
    setSelecting(null);
    if (error || data?.error) { toast.error('Falha ao selecionar conta'); return; }
    toast.success('Conta selecionada');
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
            <h4 className="text-sm font-semibold text-foreground mb-1">Selecionar conta do cliente</h4>
            <p className="text-xs text-muted-foreground">Informe o Customer ID (formato 123-456-7890) que você encontra no canto superior direito do Google Ads.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="text-xs text-muted-foreground">Customer ID da conta</label>
              <Input placeholder="123-456-7890" value={manualCustomerId} onChange={(e) => setManualCustomerId(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Login Customer ID (MCC, opcional)</label>
              <Input placeholder="000-000-0000" value={loginCustomerId} onChange={(e) => setLoginCustomerId(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => selectCustomer(manualCustomerId)} disabled={!manualCustomerId || !!selecting} className="gap-1">
                {selecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Conectar
              </Button>
            </div>
          </div>

          {customers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Contas acessíveis com sua autorização:</p>
              {customers.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <p className="text-sm font-medium text-foreground">{c.formatted}</p>
                  <Button size="sm" variant="outline" onClick={() => selectCustomer(c.id)} disabled={!!selecting}>
                    {selecting === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Selecionar'}
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
