import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, Settings2, Search, AlertCircle, Link2,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend,
} from 'recharts';

// ---------------------------------------------------------------
// Definição das colunas/métricas (espelha o gerenciador do Google)
// ---------------------------------------------------------------
type Fmt = 'int' | 'pct' | 'brl' | 'dec';
interface ColumnDef {
  key: string;
  label: string;
  fmt: Fmt;
  group: string;
  derived?: boolean;
}
const COLUMNS: ColumnDef[] = [
  { key: 'impressions',                    label: 'Impressões',                fmt: 'int', group: 'Performance' },
  { key: 'clicks',                         label: 'Cliques',                   fmt: 'int', group: 'Performance' },
  { key: 'ctr',                            label: 'CTR',                       fmt: 'pct', group: 'Performance' },
  { key: 'average_cpc',                    label: 'CPC médio',                 fmt: 'brl', group: 'Performance' },
  { key: 'cost',                           label: 'Custo',                     fmt: 'brl', group: 'Performance' },
  { key: 'conversions',                    label: 'Conversões',                fmt: 'dec', group: 'Conversão' },
  { key: 'cpa',                            label: 'Custo por conversão',       fmt: 'brl', group: 'Conversão', derived: true },
  { key: 'conversions_value',              label: 'Valor de conversão',        fmt: 'brl', group: 'Conversão' },
  { key: 'roas',                           label: 'ROAS',                      fmt: 'dec', group: 'Conversão', derived: true },
  { key: 'all_conversions',                label: 'Todas as conversões',       fmt: 'dec', group: 'Conversão' },
  { key: 'search_impression_share',        label: 'Parcela de impressões',     fmt: 'pct', group: 'Concorrência' },
  { key: 'search_top_impression_share',    label: 'Parcela impressões topo',   fmt: 'pct', group: 'Concorrência' },
  { key: 'absolute_top_impression_percentage', label: '% topo absoluto',       fmt: 'pct', group: 'Concorrência' },
  { key: 'video_views',                    label: 'Visualizações de vídeo',    fmt: 'int', group: 'Vídeo' },
  { key: 'average_cpv',                    label: 'CPV médio',                 fmt: 'brl', group: 'Vídeo' },
  { key: 'engagements',                    label: 'Engajamentos',              fmt: 'int', group: 'Engajamento' },
  { key: 'interactions',                   label: 'Interações',                fmt: 'int', group: 'Engajamento' },
];

const COL_BY_KEY: Record<string, ColumnDef> = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

const DEFAULT_COLUMNS = [
  'impressions', 'clicks', 'ctr', 'average_cpc', 'cost',
  'conversions', 'cpa', 'roas', 'search_impression_share',
];

// ---------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------
const fmtBRL = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => (v || 0).toLocaleString('pt-BR');
const fmtPct = (v: number) => `${(v || 0).toFixed(2)}%`;
const fmtDec = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function format(v: any, fmt: Fmt) {
  const n = Number(v || 0);
  if (fmt === 'brl') return fmtBRL(n);
  if (fmt === 'pct') return fmtPct(n);
  if (fmt === 'int') return fmtInt(n);
  return fmtDec(n);
}

// ---------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------
type PeriodKey = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'custom';
function rangeForPeriod(p: PeriodKey, customStart?: string, customEnd?: string) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today') return { start: fmt(today), end: fmt(today) };
  if (p === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { start: fmt(y), end: fmt(y) };
  }
  if (p === '7d') {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { start: fmt(s), end: fmt(today) };
  }
  if (p === '30d') {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { start: fmt(s), end: fmt(today) };
  }
  if (p === 'this_month') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: fmt(s), end: fmt(today) };
  }
  return { start: customStart || fmt(today), end: customEnd || fmt(today) };
}

// ---------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------
interface ClientRow { id: string; name: string; }
interface Connection { selected_customer_id: string | null; selected_customer_name: string | null; }

export default function GoogleAdsReport() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [checkingConn, setCheckingConn] = useState(false);

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [groupBy, setGroupBy] = useState<'campaign' | 'ad_group'>('campaign');
  const [campaignFilter, setCampaignFilter] = useState<Set<string>>(new Set());
  const [campaignSearch, setCampaignSearch] = useState('');

  const [columns, setColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gads-report-columns');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) return arr.filter((k: string) => COL_BY_KEY[k]);
      }
    } catch { /* ignore */ }
    return DEFAULT_COLUMNS;
  });
  const [colsDialogOpen, setColsDialogOpen] = useState(false);

  const [chartMetric, setChartMetric] = useState<string>('cost');

  const [rows, setRows] = useState<any[]>([]);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Carrega clientes ativos
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clients').select('id,name').eq('status', 'Ativo').order('name');
      setClients((data || []) as ClientRow[]);
    })();
  }, []);

  // Verifica conexão ao trocar cliente
  useEffect(() => {
    if (!clientId) { setConnection(null); setRows([]); setTimeseries([]); return; }
    setCheckingConn(true);
    (async () => {
      const { data } = await supabase.from('google_ads_connections')
        .select('selected_customer_id, selected_customer_name')
        .eq('client_id', clientId).maybeSingle();
      setConnection(data);
      setCheckingConn(false);
    })();
  }, [clientId]);

  const fetchReport = useCallback(async () => {
    if (!clientId || !connection?.selected_customer_id) return;
    setLoading(true); setErrorMsg('');
    const { start, end } = rangeForPeriod(period, customStart, customEnd);
    const { data, error } = await supabase.functions.invoke('google-ads-report', {
      body: {
        client_id: clientId,
        start_date: start,
        end_date: end,
        metrics: columns,
        group_by: groupBy,
        campaign_ids: groupBy === 'ad_group' && campaignFilter.size > 0 ? Array.from(campaignFilter) : [],
        include_timeseries: true,
      },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error || error?.message || 'Falha ao carregar relatório';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setRows([]); setTimeseries([]);
      return;
    }
    setRows((data as any).rows || []);
    setTimeseries((data as any).timeseries || []);
  }, [clientId, connection?.selected_customer_id, period, customStart, customEnd, columns, groupBy, campaignFilter]);

  // Recarrega automaticamente quando filtros relevantes mudam
  useEffect(() => {
    if (clientId && connection?.selected_customer_id) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, connection?.selected_customer_id, period, customStart, customEnd, groupBy]);

  function saveColumns(next: string[]) {
    setColumns(next);
    try { localStorage.setItem('gads-report-columns', JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Filtra linhas pelo nome (busca local)
  const filteredRows = useMemo(() => {
    const q = campaignSearch.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((r: any) => (r.name || '').toLowerCase().includes(q));
    // Quando agrupado por ad_group e há filtro de campanhas, aplica também
    if (groupBy === 'ad_group' && campaignFilter.size > 0) {
      list = list.filter((r: any) => campaignFilter.has(String(r.campaign_id)));
    }
    return list;
  }, [rows, campaignSearch, groupBy, campaignFilter]);

  // Totais (somando métricas brutas; derivadas recalculadas)
  const totals = useMemo(() => {
    const t: any = {
      impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0,
      all_conversions: 0, video_views: 0, engagements: 0, interactions: 0,
    };
    for (const r of filteredRows) {
      t.impressions += Number(r.impressions || 0);
      t.clicks += Number(r.clicks || 0);
      t.cost += Number(r.cost || 0);
      t.conversions += Number(r.conversions || 0);
      t.conversions_value += Number(r.conversions_value || 0);
      t.all_conversions += Number(r.all_conversions || 0);
      t.video_views += Number(r.video_views || 0);
      t.engagements += Number(r.engagements || 0);
      t.interactions += Number(r.interactions || 0);
    }
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
    t.average_cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
    t.cpa = t.conversions > 0 ? t.cost / t.conversions : 0;
    t.roas = t.cost > 0 ? t.conversions_value / t.cost : 0;
    t.average_cpv = t.video_views > 0 ? t.cost / t.video_views : 0;
    return t;
  }, [filteredRows]);

  // Lista única de campanhas (a partir das rows quando agrupado por ad_group, ou rows quando campanha)
  const campaignOptions = useMemo(() => {
    if (groupBy === 'campaign') {
      return rows.map((r: any) => ({ id: String(r.id), name: r.name }));
    }
    const map = new Map<string, string>();
    for (const r of rows) if (r.campaign_id) map.set(String(r.campaign_id), r.campaign_name || '');
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows, groupBy]);

  // ----- UI estados iniciais -----
  if (!clientId) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Relatório do Google Ads</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-xs">Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Escolha o cliente cuja conta Google Ads deseja analisar.</p>
        </CardContent>
      </Card>
    );
  }

  if (checkingConn) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!connection?.selected_customer_id) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Link2 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Google Ads não conectado para este cliente</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Vá em <strong>Clientes → {clients.find(c => c.id === clientId)?.name} → Google Ads</strong> e conecte uma conta antes de gerar o relatório.
            </p>
          </div>
          <Button variant="outline" onClick={() => setClientId('')}>Trocar cliente</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <Label className="text-xs">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Label className="text-xs">Agrupar por</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">Campanha</SelectItem>
                  <SelectItem value="ad_group">Grupo de anúncios</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[260px]">
              <Label className="text-xs">Período</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {([
                  { v: 'today', l: 'Hoje' },
                  { v: 'yesterday', l: 'Ontem' },
                  { v: '7d', l: '7 dias' },
                  { v: '30d', l: '30 dias' },
                  { v: 'this_month', l: 'Mês atual' },
                  { v: 'custom', l: 'Personalizado' },
                ] as const).map(p => (
                  <Button key={p.v} type="button" size="sm"
                    variant={period === p.v ? 'default' : 'outline'}
                    onClick={() => setPeriod(p.v)}>
                    {p.l}
                  </Button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2 max-w-md">
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                  <Button size="sm" className="col-span-2" onClick={fetchReport} disabled={!customStart || !customEnd}>
                    Aplicar período
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setColsDialogOpen(true)} className="gap-1">
                <Settings2 className="w-3.5 h-3.5" /> Colunas
              </Button>
              <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading} className="gap-1">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          </div>

          {/* Filtros adicionais */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px]">
              <Label className="text-xs">Buscar {groupBy === 'ad_group' ? 'grupo de anúncios' : 'campanha'}</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)}
                  placeholder="Nome..." className="pl-7 h-9" />
              </div>
            </div>

            {groupBy === 'ad_group' && campaignOptions.length > 0 && (
              <div className="min-w-[260px]">
                <Label className="text-xs">Filtrar por campanha</Label>
                <CampaignFilter
                  options={campaignOptions}
                  selected={campaignFilter}
                  onChange={setCampaignFilter}
                />
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Conta ativa: <strong className="text-foreground">{connection.selected_customer_name || connection.selected_customer_id}</strong>
          </p>
        </CardContent>
      </Card>

      {errorMsg && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Gráfico de evolução */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Evolução no período</CardTitle>
          <div className="min-w-[200px]">
            <Select value={chartMetric} onValueChange={setChartMetric}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLUMNS.filter(c => !['search_impression_share','search_top_impression_share','absolute_top_impression_percentage'].includes(c.key))
                  .map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-64 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : timeseries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">Sem dados no período.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                    formatter={(v: any) => format(v, COL_BY_KEY[chartMetric]?.fmt || 'dec')}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey={chartMetric} name={COL_BY_KEY[chartMetric]?.label || chartMetric}
                    stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {groupBy === 'ad_group' ? 'Grupos de anúncios' : 'Campanhas'} ({filteredRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filteredRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum dado para este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border/50 bg-secondary/30">
                    <th className="text-left font-medium py-2 px-2 sticky left-0 bg-secondary/30 z-10">
                      {groupBy === 'ad_group' ? 'Grupo de anúncios' : 'Campanha'}
                    </th>
                    {groupBy === 'ad_group' && (
                      <th className="text-left font-medium py-2 px-2">Campanha</th>
                    )}
                    <th className="text-right font-medium py-2 px-2">Status</th>
                    {columns.map(k => COL_BY_KEY[k] && (
                      <th key={k} className="text-right font-medium py-2 px-2 whitespace-nowrap">{COL_BY_KEY[k].label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-secondary/30">
                      <td className="py-2 px-2 text-foreground font-medium sticky left-0 bg-card">{r.name}</td>
                      {groupBy === 'ad_group' && (
                        <td className="py-2 px-2 text-muted-foreground text-xs">{r.campaign_name}</td>
                      )}
                      <td className="py-2 px-2 text-right text-muted-foreground text-xs">{r.status}</td>
                      {columns.map(k => COL_BY_KEY[k] && (
                        <td key={k} className="py-2 px-2 text-right text-foreground whitespace-nowrap">
                          {format(r[k], COL_BY_KEY[k].fmt)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border/60 font-semibold bg-secondary/20">
                    <td className="py-2 px-2 sticky left-0 bg-secondary/20">Total</td>
                    {groupBy === 'ad_group' && <td />}
                    <td />
                    {columns.map(k => COL_BY_KEY[k] && (
                      <td key={k} className="py-2 px-2 text-right whitespace-nowrap">
                        {format(totals[k], COL_BY_KEY[k].fmt)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Colunas */}
      <ColumnsDialog
        open={colsDialogOpen}
        onClose={() => setColsDialogOpen(false)}
        selected={columns}
        onSave={(next) => { saveColumns(next); setColsDialogOpen(false); fetchReport(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// Filtro de campanhas (multi-seleção compacto)
// ---------------------------------------------------------------
function CampaignFilter({
  options, selected, onChange,
}: {
  options: { id: string; name: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="w-full justify-between h-9" onClick={() => setOpen(o => !o)}>
        <span className="truncate text-xs">
          {selected.size === 0 ? 'Todas as campanhas' : `${selected.size} selecionada(s)`}
        </span>
      </Button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-popover border border-border rounded-md p-2 shadow-md space-y-1">
          <div className="flex justify-between mb-1">
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => onChange(new Set(options.map(o => o.id)))}>Todas</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => onChange(new Set())}>Nenhuma</Button>
          </div>
          {options.map(o => {
            const checked = selected.has(o.id);
            return (
              <label key={o.id} className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 hover:bg-secondary/40 rounded">
                <Checkbox checked={checked} onCheckedChange={() => {
                  const next = new Set(selected);
                  if (checked) next.delete(o.id); else next.add(o.id);
                  onChange(next);
                }} />
                <span className="truncate">{o.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Dialog de Colunas (igual gerenciador do Google)
// ---------------------------------------------------------------
function ColumnsDialog({
  open, onClose, selected, onSave,
}: {
  open: boolean; onClose: () => void; selected: string[]; onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => { if (open) setDraft(selected); }, [open, selected]);

  const grouped = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    for (const c of COLUMNS) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return Array.from(map.entries());
  }, []);

  function toggle(key: string) {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modificar colunas</DialogTitle>
          <DialogDescription>
            Marque as métricas que você quer ver na tabela. A ordem segue a sequência marcada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
          {grouped.map(([group, cols]) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
              {cols.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={draft.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(DEFAULT_COLUMNS)}>Restaurar padrão</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(draft)} disabled={draft.length === 0}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
