import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Folder, LayoutGrid, Image as ImageIcon, Loader2, Download, X, Plus, Edit2, Trash2, FileText, Link2, ExternalLink,
  ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import EntityStatusToggle from '@/components/EntityStatusToggle';
import QuickEditDialog from '@/components/QuickEditDialog';
import ColumnsCustomizerDialog, { ALL_METRIC_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from '@/components/ColumnsCustomizerDialog';
import { DateRangePicker, type DateRangeValue } from '@/components/DateRangePicker';
import { metricsForObjective, type CampaignInsights } from '@/lib/campaignMetrics';

export interface Campaign {
  id: string; name: string; platform: string; objective: string; status: string; start_date: string;
  budget: number; notes: string;
  source?: string; meta_campaign_id?: string | null; meta_ad_account_id?: string | null;
  optimization_goal?: string | null;
  destination_type?: string | null;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; cpa?: number; roas?: number;
  followers?: number; profile_visits?: number;
}

interface AdSet {
  id: string; campaign_id: string; name: string; status: string;
  meta_campaign_id?: string | null; meta_adset_id?: string | null;
  daily_budget?: number; lifetime_budget?: number; optimization_goal?: string;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; engagements?: number; frequency?: number; roas?: number;
  followers?: number; profile_visits?: number;
}

interface Creative {
  id: string; campaign_id: string; name: string; type: string; link: string; status: string;
  source?: string; thumbnail_url?: string | null; body?: string | null; title?: string | null;
  meta_ad_id?: string | null; meta_adset_id?: string | null;
  optimization_goal?: string | null;
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; engagements?: number; frequency?: number; roas?: number;
  followers?: number; profile_visits?: number;
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

// Formatadores por chave de métrica. Toda métrica que aparece em ALL_METRIC_COLUMNS
// precisa ter um formatador aqui (cai no default fmtInt se não houver).
const METRIC_FORMATTERS: Record<string, (v: number) => string> = {
  spend: fmtBRL, cpm: fmtBRL, cpc: fmtBRL, cpl: fmtBRL, cpa: fmtBRL, cpp: fmtBRL,
  cpm_msg: fmtBRL, cost_per_engagement: fmtBRL, cost_per_follower: fmtBRL, revenue: fmtBRL,
  ctr: (v) => `${(v || 0).toFixed(2)}%`,
  frequency: (v) => fmtNum(v, 2),
  roas: (v) => `${fmtNum(v, 2)}x`,
};
const formatMetric = (key: string, v: number): string => (METRIC_FORMATTERS[key] || fmtInt)(v);

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

// Mapeia o label que metricsForObjective usa para a chave do catálogo de colunas.
// Usado para que o usuário consiga remover/incluir extras pelo "Personalizar colunas"
// SEM alterar a captura/cálculo dos dados.
const EXTRA_LABEL_TO_KEY: Record<string, string> = {
  'Gasto': 'spend',
  'Alcance': 'reach',
  'Impressões': 'impressions',
  'CPM': 'cpm',
  'Frequência': 'frequency',
  'Cliques no link': 'link_clicks',
  'CTR': 'ctr',
  'CPC': 'cpc',
  'Mensagens': 'messages',
  'Custo/Msg': 'cpm_msg',
  'Engajamentos': 'engagements',
  'Custo/Eng.': 'cost_per_engagement',
  'Visualizações de vídeo': 'video_views',
  'Leads': 'leads',
  'CPL': 'cpl',
  'Instalações/Eventos': 'purchases',
  'Custo por evento': 'cpp',
  'Compras': 'purchases',
  'Custo/Compra': 'cpp',
  'Receita': 'revenue',
  'ROAS': 'roas',
};

// Calcula a união ordenada de métricas extras (detectadas pelo objetivo) que:
//  - NÃO duplicam uma coluna já selecionada como fixa, e
//  - estão na seleção do usuário (visibleColumnKeys), quando há mapeamento conhecido.
// Labels sem mapeamento (caso futuro) aparecem por padrão para não esconder dados novos.
function computeExtraColumns(
  rows: { item: { objective?: string; optimization_goal?: string | null; destination_type?: string | null; campaign_id?: string }; ins: CampaignInsights }[],
  visibleLabelSet: Set<string>,
  visibleKeySet: Set<string>,
  objectiveResolver?: (campaignId: string) => string,
  optGoalResolver?: (item: any) => string,
  destResolver?: (item: any) => string,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const { item, ins } of rows) {
    const obj = (item as any).objective || (objectiveResolver && (item as any).campaign_id ? objectiveResolver((item as any).campaign_id) : '');
    const og = optGoalResolver ? optGoalResolver(item) : ((item as any).optimization_goal || '');
    const dt = destResolver ? destResolver(item) : ((item as any).destination_type || '');
    const cells = metricsForObjective(obj, ins, og, dt);
    for (const c of cells) {
      if (visibleLabelSet.has(c.label)) continue;
      const mappedKey = EXTRA_LABEL_TO_KEY[c.label];
      if (mappedKey && !visibleKeySet.has(mappedKey)) continue; // usuário desmarcou — não mostrar
      if (!seen.has(c.label)) { seen.add(c.label); ordered.push(c.label); }
    }
  }
  return ordered;
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

  // Insights AO VIVO da Meta para conjuntos e anúncios — buscados no MESMO período
  // selecionado em dateRange usando exatamente o mesmo parsing de meta-campaign-insights.
  // Isso garante paridade 100% com o Gerenciador de Anúncios e consistência entre
  // as abas Campanha / Conjunto / Anúncio (sem depender de dados antigos do banco).
  const [liveAdsetIns, setLiveAdsetIns] = useState<Record<string, CampaignInsights>>({});
  const [liveAdIns, setLiveAdIns] = useState<Record<string, CampaignInsights>>({});
  const [importingAdsets, setImportingAdsets] = useState(false);
  const [importingAds, setImportingAds] = useState(false);

  const [sort, setSort] = useState<SortState>({ key: 'spend', dir: 'desc' });

  // Quick Edit dialog
  const [quickEditAdset, setQuickEditAdset] = useState<AdSet | null>(null);

  // Personalização de colunas (compartilhada entre Campanhas, Conjuntos e Anúncios).
  // Persistida por cliente em localStorage.
  const COLS_STORAGE_KEY = `meta-visible-cols:${clientId}`;
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [...DEFAULT_VISIBLE_COLUMNS];
  });
  useEffect(() => {
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleColumnKeys)); } catch { /* ignore */ }
  }, [visibleColumnKeys, COLS_STORAGE_KEY]);
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);

  // Colunas fixas selecionadas pelo usuário (preserva ordem do catálogo) — vão sempre aparecer no header.
  const selectedFixedCols = useMemo(
    () => ALL_METRIC_COLUMNS.filter(c => visibleColumnKeys.includes(c.key)),
    [visibleColumnKeys],
  );
  const selectedFixedLabels = useMemo(
    () => new Set(selectedFixedCols.map(c => c.label)),
    [selectedFixedCols],
  );

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

  // Carrega conjuntos e criativos imediatamente quando há campanhas Meta,
  // para que apareçam ao trocar de aba sem precisar clicar em "Importar".
  useEffect(() => { loadAllAdsets(); }, [loadAllAdsets]);
  useEffect(() => { loadAllCreatives(); }, [loadAllCreatives]);

  // Quando o ClientDetail termina o auto-sync com a Meta em background,
  // recarregamos as listas direto do banco para refletir os dados atualizados
  // sem o usuário precisar clicar em "Importar".
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.clientId && detail.clientId !== clientId) return;
      loadAllAdsets();
      loadAllCreatives();
    };
    window.addEventListener('meta-auto-sync-done', onSync);
    return () => window.removeEventListener('meta-auto-sync-done', onSync);
  }, [clientId, loadAllAdsets, loadAllCreatives]);

  // Busca insights AO VIVO de conjuntos e anúncios para o período selecionado.
  // Usa o mesmo parsing/atribuição de meta-campaign-insights -> números 100%
  // idênticos entre as abas Campanhas, Conjuntos e Anúncios e iguais ao
  // Gerenciador de Anúncios.
  useEffect(() => {
    if (!clientId) return;
    const hasMeta = campaigns.some(c => c.source === 'meta');
    if (!hasMeta) { setLiveAdsetIns({}); setLiveAdIns({}); return; }
    const period = buildPeriodBody();
    let cancelled = false;
    (async () => {
      try {
        const [adsetRes, adRes] = await Promise.allSettled([
          supabase.functions.invoke('meta-adset-insights', { body: { client_id: clientId, ...period } }),
          supabase.functions.invoke('meta-ad-insights',    { body: { client_id: clientId, ...period } }),
        ]);
        if (cancelled) return;
        if (adsetRes.status === 'fulfilled' && !adsetRes.value.error) {
          setLiveAdsetIns((adsetRes.value.data?.insights || {}) as any);
        }
        if (adRes.status === 'fulfilled' && !adRes.value.error) {
          setLiveAdIns((adRes.value.data?.insights || {}) as any);
        }
      } catch (e) {
        console.warn('[live insights adset/ad] falhou:', e);
      }
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clientId, campaigns.length, dateRange.preset, dateRange.since, dateRange.until]);

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
    followers: 0, profile_visits: 0, cost_per_follower: 0,
  };
  // Prefere SEMPRE os insights ao vivo da Meta (mesmo período/atribuição da aba
  // Campanhas). Cai no banco apenas se a Meta ainda não respondeu — nunca mistura.
  const emptyIns: CampaignInsights = {
    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0,
    leads: 0, purchases: 0, messages: 0, link_clicks: 0, revenue: 0,
    cpl: 0, cpp: 0, cpm_msg: 0, roas: 0, engagements: 0, frequency: 0, cost_per_engagement: 0,
    followers: 0, profile_visits: 0, cost_per_follower: 0,
  };
  const insightsFromAdSet = (a: AdSet): CampaignInsights => {
    const live = a.meta_adset_id ? liveAdsetIns[a.meta_adset_id] : undefined;
    if (live) return { ...emptyIns, ...live };
    return {
      ...emptyIns,
      spend: Number(a.spend) || 0, impressions: Number(a.impressions) || 0, clicks: Number(a.clicks) || 0,
      ctr: Number(a.ctr) || 0, cpc: Number(a.cpc) || 0, cpm: Number(a.cpm) || 0, reach: Number(a.reach) || 0,
      leads: Number(a.leads) || 0, purchases: Number(a.purchases) || 0, messages: Number(a.messages) || 0,
      link_clicks: Number(a.link_clicks) || 0, revenue: Number(a.revenue) || 0,
      cpl: Number(a.leads) > 0 ? Number(a.spend) / Number(a.leads) : 0,
      cpp: Number(a.purchases) > 0 ? Number(a.spend) / Number(a.purchases) : 0,
      cpm_msg: Number(a.messages) > 0 ? Number(a.spend) / Number(a.messages) : 0,
      roas: Number(a.roas) || 0, engagements: Number(a.engagements) || 0, frequency: Number(a.frequency) || 0,
      cost_per_engagement: Number(a.engagements) > 0 ? Number(a.spend) / Number(a.engagements) : 0,
      followers: Number(a.followers) || 0, profile_visits: Number(a.profile_visits) || 0,
      cost_per_follower: Number(a.followers) > 0 ? Number(a.spend) / Number(a.followers) : 0,
    };
  };
  const insightsFromCreative = (cr: Creative): CampaignInsights => {
    const live = cr.meta_ad_id ? liveAdIns[cr.meta_ad_id] : undefined;
    if (live) return { ...emptyIns, ...live };
    return {
      ...emptyIns,
      spend: Number(cr.spend) || 0, impressions: Number(cr.impressions) || 0, clicks: Number(cr.clicks) || 0,
      ctr: Number(cr.ctr) || 0, cpc: Number(cr.cpc) || 0, cpm: Number(cr.cpm) || 0, reach: Number(cr.reach) || 0,
      leads: Number(cr.leads) || 0, purchases: Number(cr.purchases) || 0, messages: Number(cr.messages) || 0,
      link_clicks: Number(cr.link_clicks) || 0, revenue: Number(cr.revenue) || 0,
      cpl: Number(cr.leads) > 0 ? Number(cr.spend) / Number(cr.leads) : 0,
      cpp: Number(cr.purchases) > 0 ? Number(cr.spend) / Number(cr.purchases) : 0,
      cpm_msg: Number(cr.messages) > 0 ? Number(cr.spend) / Number(cr.messages) : 0,
      roas: Number(cr.roas) || 0, engagements: Number(cr.engagements) || 0, frequency: Number(cr.frequency) || 0,
      cost_per_engagement: Number(cr.engagements) > 0 ? Number(cr.spend) / Number(cr.engagements) : 0,
      followers: Number(cr.followers) || 0, profile_visits: Number(cr.profile_visits) || 0,
      cost_per_follower: Number(cr.followers) > 0 ? Number(cr.spend) / Number(cr.followers) : 0,
    };
  };

  const campaignFor = (campId: string) => campaigns.find(c => c.id === campId);
  const objectiveFor = (campId: string) => campaignFor(campId)?.objective || '';
  const optGoalForCampaign = (campId: string) => campaignFor(campId)?.optimization_goal || '';
  const destTypeForCampaign = (campId: string) => campaignFor(campId)?.destination_type || '';

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

  // Colunas extras: métricas relevantes pelo objetivo da campanha, filtradas pela seleção
  // do usuário em "Personalizar colunas" (também removíveis/incluíveis).
  const visibleKeySet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const campaignsExtraCols = useMemo(
    () => computeExtraColumns(sortedCampaigns as any, selectedFixedLabels, visibleKeySet),
    [sortedCampaigns, selectedFixedLabels, visibleKeySet],
  );
  const adsetsExtraCols = useMemo(
    () => computeExtraColumns(
      sortedAdsets as any,
      selectedFixedLabels,
      visibleKeySet,
      (cid: string) => objectiveFor(cid),
      (a: any) => a.optimization_goal || optGoalForCampaign(a.campaign_id),
      (a: any) => destTypeForCampaign(a.campaign_id),
    ),
    [sortedAdsets, campaigns, selectedFixedLabels, visibleKeySet],
  );
  const adsExtraCols = useMemo(
    () => computeExtraColumns(
      sortedAds as any,
      selectedFixedLabels,
      visibleKeySet,
      (cid: string) => objectiveFor(cid),
      (cr: any) => cr.optimization_goal || optGoalForCampaign(cr.campaign_id),
      (cr: any) => destTypeForCampaign(cr.campaign_id),
    ),
    [sortedAds, campaigns, selectedFixedLabels, visibleKeySet],
  );

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

  // Header de métricas: colunas escolhidas pelo usuário + extras detectadas pelo objetivo
  const renderMetricsHeader = (extraCols: string[]) => (
    <>
      {selectedFixedCols.map(col => (
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
      {extraCols.map(label => (
        <th key={label} className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
          {label}
        </th>
      ))}
    </>
  );

  // Renderiza células: colunas fixas escolhidas + extras detectadas
  const renderMetricsCells = (
    ins: CampaignInsights,
    objective: string,
    extraCols: string[],
    optimizationGoal?: string,
    destinationType?: string,
  ) => {
    const dynamicCells = metricsForObjective(objective, ins, optimizationGoal, destinationType);
    const extrasMap = new Map(dynamicCells.map(c => [c.label, c]));
    return (
      <>
        {selectedFixedCols.map(col => {
          const v = Number((ins as any)[col.key]) || 0;
          return (
            <td key={col.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-foreground">
              {v > 0 ? formatMetric(col.key, v) : <span className="text-muted-foreground/40">—</span>}
            </td>
          );
        })}
        {extraCols.map(label => {
          const m = extrasMap.get(label);
          if (!m) {
            return (
              <td key={label} className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground/40">—</td>
            );
          }
          return (
            <td
              key={label}
              className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${m.highlight ? 'text-primary font-semibold' : 'text-foreground'}`}
            >
              {m.value}
            </td>
          );
        })}
      </>
    );
  };

  return (
    <>
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
          {/* Personalizar colunas — sempre visível em todos os níveis */}
          <Button
            onClick={() => setColumnsDialogOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Escolher quais métricas aparecem nas tabelas"
          >
            <SlidersHorizontal className="w-3 h-3" /> Personalizar colunas
            <span className="ml-1 text-[10px] text-muted-foreground">({visibleColumnKeys.length})</span>
          </Button>
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
                  {renderMetricsHeader(campaignsExtraCols)}
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
                      <td className="px-3 py-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleCampaign(c.id)} />
                      </td>
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
                      {renderMetricsCells(ins, c.objective, campaignsExtraCols, c.optimization_goal || '', c.destination_type || '')}
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
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-2 py-2 w-16 text-muted-foreground font-medium">Status</th>
                    <th className="px-3 py-2 text-muted-foreground font-medium min-w-[260px]">
                      <SortHeader label="Conjunto" active={sort.key === 'name'} dir={sort.dir} onClick={() => toggleSort('name')} />
                    </th>
                    {renderMetricsHeader(adsetsExtraCols)}
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
                        <td className="px-3 py-2"><Checkbox checked={checked} onCheckedChange={() => toggleAdSet(a.id)} /></td>
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
                        {renderMetricsCells(ins, objectiveFor(a.campaign_id), adsetsExtraCols, a.optimization_goal || optGoalForCampaign(a.campaign_id), destTypeForCampaign(a.campaign_id))}
                        <td className="px-3 py-2 w-0"></td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setQuickEditAdset(a)}
                              disabled={!a.meta_adset_id}
                              title={a.meta_adset_id ? 'Edição rápida' : 'Disponível só para conjuntos importados da Meta'}
                            >
                              <Edit2 className="w-3 h-3 mr-1" /> Editar
                            </Button>
                            <EntityActionsMenu
                              clientId={clientId} entityType="adset"
                              metaId={a.meta_adset_id} status={a.status}
                              onChanged={() => loadAllAdsets()}
                            />
                          </div>
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
                    {renderMetricsHeader(adsExtraCols)}
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
                        {renderMetricsCells(ins, objectiveFor(cr.campaign_id), adsExtraCols, cr.optimization_goal || optGoalForCampaign(cr.campaign_id), destTypeForCampaign(cr.campaign_id))}
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
    {quickEditAdset && (
      <QuickEditDialog
        open={!!quickEditAdset}
        onClose={() => setQuickEditAdset(null)}
        clientId={clientId}
        adset={{
          id: quickEditAdset.id,
          name: quickEditAdset.name,
          meta_adset_id: quickEditAdset.meta_adset_id,
          status: quickEditAdset.status,
          daily_budget: quickEditAdset.daily_budget,
          lifetime_budget: quickEditAdset.lifetime_budget,
          optimization_goal: quickEditAdset.optimization_goal,
        }}
        creatives={creatives
          .filter(cr => cr.meta_adset_id && cr.meta_adset_id === quickEditAdset.meta_adset_id)
          .map(cr => ({
            id: cr.id,
            name: cr.name,
            meta_ad_id: cr.meta_ad_id,
            meta_adset_id: cr.meta_adset_id,
            thumbnail_url: cr.thumbnail_url,
            body: cr.body,
            title: cr.title,
          }))}
        onChanged={() => { loadAllAdsets(); loadAllCreatives(); }}
      />
    )}
    <ColumnsCustomizerDialog
      open={columnsDialogOpen}
      onClose={() => setColumnsDialogOpen(false)}
      visibleKeys={visibleColumnKeys}
      onChange={setVisibleColumnKeys}
    />
    </>
  );
}
