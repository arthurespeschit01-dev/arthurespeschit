import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Folder, LayoutGrid, Image as ImageIcon, Loader2, Download, X, Plus, Edit2, Trash2, FileText, Link2, ExternalLink,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import EntityStatusToggle from '@/components/EntityStatusToggle';
import { DateRangePicker, type DateRangeValue } from '@/components/DateRangePicker';
import { metricsForObjective, type CampaignInsights } from '@/lib/campaignMetrics';

export interface Campaign {
  id: string; name: string; platform: string; objective: string; status: string; start_date: string;
  budget: number; notes: string;
  source?: string; meta_campaign_id?: string | null; meta_ad_account_id?: string | null;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; cpa?: number; roas?: number;
}

interface AdSet {
  id: string; campaign_id: string; name: string; status: string;
  meta_campaign_id?: string | null; meta_adset_id?: string | null;
  daily_budget?: number; lifetime_budget?: number; optimization_goal?: string;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; engagements?: number; frequency?: number; roas?: number;
}

interface Creative {
  id: string; campaign_id: string; name: string; type: string; link: string; status: string;
  source?: string; thumbnail_url?: string | null; body?: string | null; title?: string | null;
  meta_ad_id?: string | null; meta_adset_id?: string | null;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; engagements?: number; frequency?: number; roas?: number;
}

interface Props {
  clientId: string;
  campaigns: Campaign[];
  insightsByCamp: Record<string, CampaignInsights>;
  loadingInsights: boolean;
  dateRange: DateRangeValue;
  onDateRangeChange: (r: DateRangeValue) => void;
  onReloadCampaigns: () => void | Promise<void>;
  onOpenNewCampaign: () => void;
  onOpenEditCampaign: (c: Campaign) => void;
  onDeleteCampaign: (id: string, e?: React.MouseEvent) => void;
  onOpenNewCreative: (campaignId: string) => void;
  onOpenEditCreative: (cr: Creative) => void;
  onDeleteCreative: (id: string) => void;
  onPreviewCreative: (cr: Creative) => void;
  buildPeriodBody: () => any;
  importingMeta: boolean;
  onImportFromMeta: () => void;
  onExportPDF: () => void;
}

type Level = 'campaigns' | 'adsets' | 'ads';

const LEVELS: { key: Level; label: string; icon: typeof Folder }[] = [
  { key: 'campaigns', label: 'Campanhas', icon: Folder },
  { key: 'adsets', label: 'Conjuntos de anúncios', icon: LayoutGrid },
  { key: 'ads', label: 'Anúncios', icon: ImageIcon },
];

function statusColor(s?: string) {
  if (!s) return 'bg-secondary text-muted-foreground';
  const u = s.toUpperCase();
  if (u === 'ACTIVE' || /ATIV/i.test(s)) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (u === 'PAUSED' || /PAUSAD/i.test(s)) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

const fmtBRL = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => (v || 0).toLocaleString('pt-BR');
const fmtNum = (v: number, d = 2) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

// Colunas de métricas comuns/fixas exibidas na tabela
const FIXED_METRIC_COLS = [
  { key: 'spend', label: 'Gasto', fmt: fmtBRL },
  { key: 'reach', label: 'Alcance', fmt: fmtInt },
  { key: 'impressions', label: 'Impressões', fmt: fmtInt },
  { key: 'cpm', label: 'CPM', fmt: fmtBRL },
  { key: 'frequency', label: 'Frequência', fmt: (v: number) => fmtNum(v, 2) },
] as const;

type SortDir = 'asc' | 'desc';
interface SortState { key: string; dir: SortDir; }

function SortHeader({ label, active, dir, onClick, align = 'left' }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void; align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 hover:text-foreground transition-colors w-full ${align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      <span className="truncate">{label}</span>
      {active ? (
        dir === 'asc' ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
      ) : (
        <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-40" />
      )}
    </button>
  );
}

export default function MetaHierarchyTabs({
  clientId, campaigns, insightsByCamp, loadingInsights,
  dateRange, onDateRangeChange,
  onReloadCampaigns, onOpenNewCampaign, onOpenEditCampaign, onDeleteCampaign,
  onOpenNewCreative, onOpenEditCreative, onDeleteCreative, onPreviewCreative,
  buildPeriodBody, importingMeta, onImportFromMeta, onExportPDF,
}: Props) {
  const [level, setLevel] = useState<Level>('campaigns');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'Ativa' | 'Pausada' | 'Encerrada'>('todas');

  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<Set<string>>(new Set());

  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [loadingCreatives, setLoadingCreatives] = useState(false);
  const [importingAdsets, setImportingAdsets] = useState(false);
  const [importingAds, setImportingAds] = useState(false);

  const [sort, setSort] = useState<SortState>({ key: 'spend', dir: 'desc' });

  const loadAllAdsets = useCallback(async () => {
    const metaCampIds = campaigns.filter(c => c.source === 'meta').map(c => c.id);
    if (metaCampIds.length === 0) { setAdsets([]); return; }
    setLoadingAdsets(true);
    const { data } = await supabase.from('ad_sets' as any)
      .select('*').in('campaign_id', metaCampIds).order('created_at', { ascending: false });
    setAdsets((data || []) as any);
    setLoadingAdsets(false);
  }, [campaigns]);

  const loadAllCreatives = useCallback(async () => {
    const metaCampIds = campaigns.filter(c => c.source === 'meta').map(c => c.id);
    if (metaCampIds.length === 0) { setCreatives([]); return; }
    setLoadingCreatives(true);
    const { data } = await supabase.from('creatives' as any)
      .select('*').in('campaign_id', metaCampIds).order('created_at', { ascending: false });
    setCreatives((data || []) as any);
    setLoadingCreatives(false);
  }, [campaigns]);

  useEffect(() => { if (level === 'adsets') loadAllAdsets(); }, [level, loadAllAdsets]);
  useEffect(() => { if (level === 'ads') loadAllCreatives(); }, [level, loadAllCreatives]);

  // Reseta sort ao trocar de nível para o default desse nível
  useEffect(() => {
    setSort({ key: 'spend', dir: 'desc' });
  }, [level]);

  // Limpa seleção de filhos quando o pai muda
  useEffect(() => {
    setSelectedAdSetIds(prev => {
      if (prev.size === 0) return prev;
      const valid = new Set<string>();
      adsets.forEach(a => {
        if (prev.has(a.id) && (selectedCampaignIds.size === 0 || selectedCampaignIds.has(a.campaign_id))) {
          valid.add(a.id);
        }
      });
      return valid;
    });
  }, [selectedCampaignIds, adsets]);

  // Helpers
  const toggleSort = (key: string) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  };
  const toggleAdSet = (id: string) => {
    setSelectedAdSetIds(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  };
  const clearCampaignSelection = () => setSelectedCampaignIds(new Set());
  const clearAdSetSelection = () => setSelectedAdSetIds(new Set());

  // Drill-down: clicar no nome navega para o nível filho com filtro aplicado
  const drilldownCampaign = (id: string) => {
    setSelectedCampaignIds(new Set([id]));
    setSelectedAdSetIds(new Set());
    setLevel('adsets');
  };
  const drilldownAdSet = (id: string) => {
    setSelectedAdSetIds(new Set([id]));
    setLevel('ads');
  };

  // Extrai métricas de cada entidade
  const campaignInsights = (c: Campaign): CampaignInsights => insightsByCamp[c.id] || {
    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0,
    leads: 0, purchases: 0, messages: 0, link_clicks: 0, revenue: 0,
    cpl: 0, cpp: 0, cpm_msg: 0, roas: 0, engagements: 0, frequency: 0, cost_per_engagement: 0,
  };
  const insightsFromAdSet = (a: AdSet): CampaignInsights => ({
    spend: Number(a.spend) || 0, impressions: Number(a.impressions) || 0, clicks: Number(a.clicks) || 0,
    ctr: Number(a.ctr) || 0, cpc: Number(a.cpc) || 0, cpm: Number(a.cpm) || 0, reach: Number(a.reach) || 0,
    leads: Number(a.leads) || 0, purchases: Number(a.purchases) || 0, messages: Number(a.messages) || 0,
    link_clicks: Number(a.link_clicks) || 0, revenue: Number(a.revenue) || 0,
    cpl: Number(a.leads) > 0 ? Number(a.spend) / Number(a.leads) : 0,
    cpp: Number(a.purchases) > 0 ? Number(a.spend) / Number(a.purchases) : 0,
    cpm_msg: Number(a.messages) > 0 ? Number(a.spend) / Number(a.messages) : 0,
    roas: Number(a.roas) || 0, engagements: Number(a.engagements) || 0, frequency: Number(a.frequency) || 0,
    cost_per_engagement: Number(a.engagements) > 0 ? Number(a.spend) / Number(a.engagements) : 0,
  });
  const insightsFromCreative = (cr: Creative): CampaignInsights => ({
    spend: Number(cr.spend) || 0, impressions: Number(cr.impressions) || 0, clicks: Number(cr.clicks) || 0,
    ctr: Number(cr.ctr) || 0, cpc: Number(cr.cpc) || 0, cpm: Number(cr.cpm) || 0, reach: Number(cr.reach) || 0,
    leads: Number(cr.leads) || 0, purchases: Number(cr.purchases) || 0, messages: Number(cr.messages) || 0,
    link_clicks: Number(cr.link_clicks) || 0, revenue: Number(cr.revenue) || 0,
    cpl: Number(cr.leads) > 0 ? Number(cr.spend) / Number(cr.leads) : 0,
    cpp: Number(cr.purchases) > 0 ? Number(cr.spend) / Number(cr.purchases) : 0,
    cpm_msg: Number(cr.messages) > 0 ? Number(cr.spend) / Number(cr.messages) : 0,
    roas: Number(cr.roas) || 0, engagements: Number(cr.engagements) || 0, frequency: Number(cr.frequency) || 0,
    cost_per_engagement: Number(cr.engagements) > 0 ? Number(cr.spend) / Number(cr.engagements) : 0,
  });

  const objectiveFor = (campId: string) => campaigns.find(c => c.id === campId)?.objective || '';

  // Filtros derivados
  const filteredCampaigns = useMemo(() => {
    if (statusFilter === 'todas') return campaigns;
    return campaigns.filter(c => (c.status || '').toLowerCase().startsWith(statusFilter.toLowerCase().slice(0, 5)));
  }, [campaigns, statusFilter]);

  const filteredAdsets = useMemo(() => {
    if (selectedCampaignIds.size === 0) return adsets;
    return adsets.filter(a => selectedCampaignIds.has(a.campaign_id));
  }, [adsets, selectedCampaignIds]);

  const filteredAds = useMemo(() => {
    let list = creatives;
    if (selectedAdSetIds.size > 0) {
      const allowedMetaIds = new Set<string>();
      adsets.forEach(a => {
        if (selectedAdSetIds.has(a.id) && a.meta_adset_id) allowedMetaIds.add(a.meta_adset_id);
      });
      list = list.filter(cr => cr.meta_adset_id && allowedMetaIds.has(cr.meta_adset_id));
    } else if (selectedCampaignIds.size > 0) {
      list = list.filter(cr => selectedCampaignIds.has(cr.campaign_id));
    }
    return list;
  }, [creatives, selectedAdSetIds, selectedCampaignIds, adsets]);

  // Sort genérico — por chave de métrica ou por 'name'/'status'
  const getSortValue = (item: any, ins: CampaignInsights): number | string => {
    if (sort.key === 'name') return (item.name || '').toLowerCase();
    if (sort.key === 'status') return (item.status || '').toLowerCase();
    return Number((ins as any)[sort.key] || 0);
  };
  const sortRows = <T,>(rows: { item: T; ins: CampaignInsights }[]) => {
    const sorted = [...rows].sort((a, b) => {
      const va = getSortValue(a.item, a.ins);
      const vb = getSortValue(b.item, b.ins);
      if (typeof va === 'string' && typeof vb === 'string') {
        return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va), nb = Number(vb);
      return sort.dir === 'asc' ? na - nb : nb - na;
    });
    return sorted;
  };

  const sortedCampaigns = useMemo(() => {
    const rows = filteredCampaigns.map(c => ({ item: c, ins: campaignInsights(c) }));
    return sortRows(rows);
  }, [filteredCampaigns, insightsByCamp, sort]);

  const sortedAdsets = useMemo(() => {
    const rows = filteredAdsets.map(a => ({ item: a, ins: insightsFromAdSet(a) }));
    return sortRows(rows);
  }, [filteredAdsets, sort]);

  const sortedAds = useMemo(() => {
    const rows = filteredAds.map(cr => ({ item: cr, ins: insightsFromCreative(cr) }));
    return sortRows(rows);
  }, [filteredAds, sort]);

  // Imports por nível
  const importAdsetsForSelection = async () => {
    setImportingAdsets(true);
    toast.loading('Importando conjuntos da Meta...', { id: 'imp-adsets' });
    try {
      const targets = selectedCampaignIds.size > 0
        ? campaigns.filter(c => c.source === 'meta' && selectedCampaignIds.has(c.id))
        : campaigns.filter(c => c.source === 'meta');
      let total = 0;
      for (const c of targets) {
        const { data } = await supabase.functions.invoke('meta-import-adsets', {
          body: { client_id: clientId, campaign_id: c.id, ...buildPeriodBody() },
        });
        total += data?.imported || 0;
      }
      toast.success(`${total} conjuntos importados`, { id: 'imp-adsets' });
      await loadAllAdsets();
    } catch {
      toast.error('Falha ao importar conjuntos', { id: 'imp-adsets' });
    } finally { setImportingAdsets(false); }
  };

  const importAds = async () => {
    setImportingAds(true);
    toast.loading('Importando anúncios da Meta...', { id: 'imp-ads' });
    const { data, error } = await supabase.functions.invoke('meta-import-creatives', {
      body: { client_id: clientId, ...buildPeriodBody() },
    });
    setImportingAds(false);
    if (error || data?.error) { toast.error('Falha ao importar anúncios', { id: 'imp-ads' }); return; }
    toast.success(`${data?.imported ?? 0} anúncios importados`, { id: 'imp-ads' });
    await loadAllCreatives();
  };

  // Header de métricas reutilizável
  const renderMetricsHeader = () => (
    <>
      {FIXED_METRIC_COLS.map(col => (
        <th key={col.key} className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
          <SortHeader
            label={col.label}
            active={sort.key === col.key}
            dir={sort.dir}
            onClick={() => toggleSort(col.key)}
            align="right"
          />
        </th>
      ))}
    </>
  );

  // Renderiza células de métricas fixas + extras dinâmicas baseadas no objetivo
  const renderMetricsCells = (ins: CampaignInsights, objective: string, name: string) => {
    const dynamicCells = metricsForObjective(objective, ins, name);
    // mostra extras (que não já estão no fixo)
    const fixedKeys = new Set<string>(FIXED_METRIC_COLS.map(c => c.label));
    const extras = dynamicCells.filter(c => !fixedKeys.has(c.label));
    return (
      <>
        {FIXED_METRIC_COLS.map(col => {
          const v = (ins as any)[col.key] || 0;
          return (
            <td key={col.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-foreground">
              {v > 0 ? col.fmt(v) : <span className="text-muted-foreground/40">—</span>}
            </td>
          );
        })}
        {extras.length > 0 && (
          <td className="px-3 py-2 whitespace-nowrap">
            <div className="flex gap-3 text-[11px]">
              {extras.map((m, i) => (
                <div key={i} className="text-right">
                  <div className="text-muted-foreground">{m.label}</div>
                  <div className={`font-semibold tabular-nums ${m.highlight ? 'text-primary' : 'text-foreground'}`}>{m.value}</div>
                </div>
              ))}
            </div>
          </td>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra de abas hierárquicas estilo Meta */}
      <div className="glass-surface rounded-xl p-2 flex items-center gap-1 overflow-x-auto">
        {LEVELS.map((l) => {
          const Icon = l.icon;
          const isActive = level === l.key;
          let badge: { text: string; onClear?: () => void } | null = null;
          if (l.key === 'adsets' && selectedCampaignIds.size > 0) {
            badge = { text: `${selectedCampaignIds.size} selecionad${selectedCampaignIds.size > 1 ? 'as' : 'a'}`, onClear: clearCampaignSelection };
          }
          if (l.key === 'ads') {
            if (selectedAdSetIds.size > 0) badge = { text: `${selectedAdSetIds.size} conjunto${selectedAdSetIds.size > 1 ? 's' : ''}`, onClear: clearAdSetSelection };
            else if (selectedCampaignIds.size > 0) badge = { text: `${selectedCampaignIds.size} campanha${selectedCampaignIds.size > 1 ? 's' : ''}`, onClear: clearCampaignSelection };
          }
          return (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{l.label}</span>
              {badge && (
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {badge.text}
                  {badge.onClear && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); badge!.onClear!(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); badge!.onClear!(); } }}
                      className="hover:bg-black/20 rounded-full p-0.5 cursor-pointer"
                      aria-label="Limpar filtro"
                    >
                      <X className="w-2.5 h-2.5" />
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar dependente do nível — tudo numa fileira */}
      <div className="flex items-center flex-wrap gap-3">
        {level === 'campaigns' && (
          <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
            {(['todas', 'Ativa', 'Pausada', 'Encerrada'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  statusFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {f === 'todas' ? 'Todas' : f}
              </button>
            ))}
          </div>
        )}
        {/* Espaço de separação entre grupos */}
        <div className="flex gap-2 items-center flex-wrap ml-6">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          {level === 'campaigns' && (
            <Button onClick={onExportPDF} variant="outline" size="sm" className="gap-2">
              <FileText className="w-3 h-3" /> Exportar PDF
            </Button>
          )}
          {level === 'adsets' && (
            <Button onClick={importAdsetsForSelection} disabled={importingAdsets} variant="outline" size="sm" className="gap-2">
              {importingAdsets ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {selectedCampaignIds.size > 0 ? `Importar das ${selectedCampaignIds.size} selecionadas` : 'Importar todos'}
            </Button>
          )}
          {level === 'ads' && (
            <Button onClick={importAds} disabled={importingAds} variant="outline" size="sm" className="gap-2">
              {importingAds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Importar anúncios
            </Button>
          )}
        </div>
      </div>

      {/* TABELA — CAMPANHAS */}
      {level === 'campaigns' && (
        <div className="glass-surface rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 border-b border-border/50">
                <tr className="text-left">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-2 py-2 w-16 text-muted-foreground font-medium">Status</th>
                  <th className="px-3 py-2 text-muted-foreground font-medium min-w-[260px]">
                    <SortHeader label="Campanha" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                  </th>
                  {renderMetricsHeader()}
                  <th className="px-3 py-2"></th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCampaigns.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma campanha encontrada.</td></tr>
                )}
                {sortedCampaigns.map(({ item: c, ins }) => {
                  const checked = selectedCampaignIds.has(c.id);
                  const isMeta = c.source === 'meta';
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/40 hover:bg-secondary/30 transition-colors ${checked ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-2 py-2">
                        {isMeta ? (
                          <EntityStatusToggle
                            clientId={clientId} entityType="campaign"
                            metaId={c.meta_campaign_id} status={c.status}
                            onChanged={() => onReloadCampaigns()}
                          />
                        ) : (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor(c.status)}`}>{c.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => drilldownCampaign(c.id)}
                          className="text-left group min-w-0 block w-full"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{c.name}</span>
                            {isMeta && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-1 shrink-0">
                                <Link2 className="w-2.5 h-2.5" /> Meta
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {c.platform} • {c.objective}{c.start_date ? ` • ${c.start_date}` : ''}
                          </div>
                        </button>
                      </td>
                      {renderMetricsCells(ins, c.objective, c.name)}
                      <td className="px-3 py-2 w-0"></td>
                      <td className="px-2 py-2 text-right">
                        {isMeta ? (
                          <EntityActionsMenu
                            clientId={clientId} entityType="campaign"
                            metaId={c.meta_campaign_id} status={c.status}
                            onChanged={() => onReloadCampaigns()}
                          />
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenEditCampaign(c)}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={(e) => onDeleteCampaign(c.id, e)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABELA — CONJUNTOS */}
      {level === 'adsets' && (
        <div className="glass-surface rounded-xl overflow-hidden">
          {loadingAdsets ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 border-b border-border/50">
                  <tr className="text-left">
                    
                    <th className="px-2 py-2 w-16 text-muted-foreground font-medium">Status</th>
                    <th className="px-3 py-2 text-muted-foreground font-medium min-w-[260px]">
                      <SortHeader label="Conjunto" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                    </th>
                    {renderMetricsHeader()}
                    <th className="px-3 py-2"></th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAdsets.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">
                      {selectedCampaignIds.size > 0
                        ? 'Nenhum conjunto encontrado para as campanhas selecionadas. Clique em "Importar" acima.'
                        : 'Nenhum conjunto carregado. Clique em "Importar todos" acima.'}
                    </td></tr>
                  )}
                  {sortedAdsets.map(({ item: a, ins }) => {
                    const checked = selectedAdSetIds.has(a.id);
                    const budget = (a.daily_budget || 0) > 0 ? `R$ ${Number(a.daily_budget).toLocaleString('pt-BR')}/dia`
                      : (a.lifetime_budget || 0) > 0 ? `R$ ${Number(a.lifetime_budget).toLocaleString('pt-BR')} total` : '—';
                    return (
                      <tr key={a.id} className={`border-b border-border/40 hover:bg-secondary/30 transition-colors ${checked ? 'bg-primary/5' : ''}`}>
                        
                        <td className="px-2 py-2">
                          <EntityStatusToggle
                            clientId={clientId} entityType="adset"
                            metaId={a.meta_adset_id} status={a.status}
                            onChanged={() => loadAllAdsets()}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => drilldownAdSet(a.id)} className="text-left group min-w-0 block w-full">
                            <div className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{a.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {budget} • {a.optimization_goal || '—'}
                            </div>
                          </button>
                        </td>
                        {renderMetricsCells(ins, objectiveFor(a.campaign_id), a.name)}
                        <td className="px-3 py-2 w-0"></td>
                        <td className="px-2 py-2 text-right">
                          <EntityActionsMenu
                            clientId={clientId} entityType="adset"
                            metaId={a.meta_adset_id} status={a.status}
                            onChanged={() => loadAllAdsets()}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TABELA — ANÚNCIOS */}
      {level === 'ads' && (
        <div className="glass-surface rounded-xl overflow-hidden">
          {loadingCreatives ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 border-b border-border/50">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-16 text-muted-foreground font-medium">Status</th>
                    <th className="px-3 py-2 text-muted-foreground font-medium min-w-[280px]">
                      <SortHeader label="Anúncio" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                    </th>
                    {renderMetricsHeader()}
                    <th className="px-3 py-2"></th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAds.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhum anúncio encontrado. Clique em "Importar anúncios" acima.
                    </td></tr>
                  )}
                  {sortedAds.map(({ item: cr, ins }) => {
                    const isMeta = cr.source === 'meta';
                    const thumb = cr.thumbnail_url || (cr.link && /\.(jpg|jpeg|png|webp|gif)/i.test(cr.link) ? cr.link : null);
                    return (
                      <tr key={cr.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors group">
                        <td className="px-2 py-2">
                          {isMeta ? (
                            <EntityStatusToggle
                              clientId={clientId} entityType="ad"
                              metaId={cr.meta_ad_id} status={cr.status}
                              onChanged={() => loadAllCreatives()}
                            />
                          ) : (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor(cr.status)}`}>{cr.status}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => onPreviewCreative(cr)}
                              className="w-9 h-9 rounded-md overflow-hidden bg-secondary/50 shrink-0 flex items-center justify-center"
                            >
                              {thumb ? (
                                <img src={thumb} alt={cr.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                              )}
                            </button>
                            <button type="button" onClick={() => onPreviewCreative(cr)} className="text-left min-w-0 flex-1 hover:text-primary transition-colors">
                              <div className="font-medium text-foreground truncate group-hover:text-primary">{cr.title || cr.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                <ExternalLink className="w-2.5 h-2.5" /> Ver criativo
                              </div>
                            </button>
                          </div>
                        </td>
                        {renderMetricsCells(ins, objectiveFor(cr.campaign_id), cr.name)}
                        <td className="px-3 py-2 w-0"></td>
                        <td className="px-2 py-2 text-right">
                          {isMeta ? (
                            <EntityActionsMenu
                              clientId={clientId} entityType="ad"
                              metaId={cr.meta_ad_id} status={cr.status}
                              onChanged={() => loadAllCreatives()}
                            />
                          ) : (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenEditCreative(cr)}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => onDeleteCreative(cr.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
