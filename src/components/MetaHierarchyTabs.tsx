import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Folder, LayoutGrid, Image as ImageIcon, Loader2, Download, X, Plus, Edit2, Trash2, FileText, Link2, ExternalLink,
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

const CREATIVE_TYPES_ICON: Record<string, typeof FileText> = {};

interface Props {
  clientId: string;
  campaigns: Campaign[];
  insightsByCamp: Record<string, CampaignInsights>;
  loadingInsights: boolean;
  dateRange: DateRangeValue;
  onDateRangeChange: (r: DateRangeValue) => void;
  // Hooks de retorno
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

  // Carrega TODOS os adsets do cliente (todos os meta campaigns deste cliente)
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

  // Limpa seleção de níveis filhos quando o pai muda
  useEffect(() => {
    setSelectedAdSetIds(prev => {
      if (prev.size === 0) return prev;
      // Mantém apenas adsets cujo campaign_id ainda esteja selecionado
      const valid = new Set<string>();
      adsets.forEach(a => {
        if (prev.has(a.id) && (selectedCampaignIds.size === 0 || selectedCampaignIds.has(a.campaign_id))) {
          valid.add(a.id);
        }
      });
      return valid;
    });
  }, [selectedCampaignIds, adsets]);

  // Filtros derivados
  const visibleCampaigns = useMemo(() => {
    if (statusFilter === 'todas') return campaigns;
    return campaigns.filter(c => (c.status || '').toLowerCase().startsWith(statusFilter.toLowerCase().slice(0, 5)));
  }, [campaigns, statusFilter]);

  const visibleAdsets = useMemo(() => {
    if (selectedCampaignIds.size === 0) return adsets;
    return adsets.filter(a => selectedCampaignIds.has(a.campaign_id));
  }, [adsets, selectedCampaignIds]);

  const visibleAds = useMemo(() => {
    let list = creatives;
    if (selectedAdSetIds.size > 0) {
      // Mapa adset_id (uuid interno) -> meta_adset_id
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

  // Helpers de seleção
  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAdSet = (id: string) => {
    setSelectedAdSetIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const clearCampaignSelection = () => setSelectedCampaignIds(new Set());
  const clearAdSetSelection = () => setSelectedAdSetIds(new Set());

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
    } finally {
      setImportingAdsets(false);
    }
  };

  const importAds = async () => {
    setImportingAds(true);
    toast.loading('Importando anúncios da Meta...', { id: 'imp-ads' });
    const { data, error } = await supabase.functions.invoke('meta-import-creatives', {
      body: { client_id: clientId, ...buildPeriodBody() },
    });
    setImportingAds(false);
    if (error || data?.error) {
      toast.error('Falha ao importar anúncios', { id: 'imp-ads' });
      return;
    }
    toast.success(`${data?.imported ?? 0} anúncios importados`, { id: 'imp-ads' });
    await loadAllCreatives();
  };

  // Helper: insights de um adset
  const insightsFromAdSet = (a: AdSet): CampaignInsights => ({
    spend: Number(a.spend) || 0,
    impressions: Number(a.impressions) || 0,
    clicks: Number(a.clicks) || 0,
    ctr: Number(a.ctr) || 0,
    cpc: Number(a.cpc) || 0,
    cpm: Number(a.cpm) || 0,
    reach: Number(a.reach) || 0,
    leads: Number(a.leads) || 0,
    purchases: Number(a.purchases) || 0,
    messages: Number(a.messages) || 0,
    link_clicks: Number(a.link_clicks) || 0,
    revenue: Number(a.revenue) || 0,
    cpl: Number(a.leads) > 0 ? Number(a.spend) / Number(a.leads) : 0,
    cpp: Number(a.purchases) > 0 ? Number(a.spend) / Number(a.purchases) : 0,
    cpm_msg: Number(a.messages) > 0 ? Number(a.spend) / Number(a.messages) : 0,
    roas: Number(a.roas) || 0,
    engagements: Number(a.engagements) || 0,
    frequency: Number(a.frequency) || 0,
    cost_per_engagement: Number(a.engagements) > 0 ? Number(a.spend) / Number(a.engagements) : 0,
  });

  // Lookup objetivo da campanha p/ formatar métricas
  const objectiveFor = (campId: string) =>
    campaigns.find(c => c.id === campId)?.objective || '';

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
            if (selectedAdSetIds.size > 0) badge = { text: `Anúncios para ${selectedAdSetIds.size} conjunto${selectedAdSetIds.size > 1 ? 's' : ''}`, onClear: clearAdSetSelection };
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

      {/* Toolbar dependente do nível */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        {level !== 'campaigns' && <div />}
        <div className="flex gap-2 items-center flex-wrap ml-auto">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          {level === 'campaigns' && (
            <>
              <Button onClick={onExportPDF} variant="outline" size="sm" className="gap-2">
                <FileText className="w-3 h-3" /> Exportar PDF
              </Button>
              <Button onClick={onImportFromMeta} disabled={importingMeta} variant="outline" size="sm" className="gap-2">
                {importingMeta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Importar da Meta
              </Button>
              <Button onClick={onOpenNewCampaign} className="neon-glow gap-2" size="sm">
                <Plus className="w-3 h-3" /> Nova Campanha
              </Button>
            </>
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

      {/* Tabela / lista do nível ativo */}
      {level === 'campaigns' && (
        <div className="space-y-2">
          {visibleCampaigns.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma campanha encontrada.</p>
          )}
          {visibleCampaigns.map(c => {
            const ins = insightsByCamp[c.id] || {
              spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0,
              leads: 0, purchases: 0, messages: 0, link_clicks: 0, revenue: 0,
              cpl: 0, cpp: 0, cpm_msg: 0, roas: 0,
              engagements: 0, frequency: 0, cost_per_engagement: 0,
            };
            const cells = c.source === 'meta' ? metricsForObjective(c.objective, ins, c.name) : [];
            const hasData = !!insightsByCamp[c.id];
            const checked = selectedCampaignIds.has(c.id);
            return (
              <div
                key={c.id}
                className={`glass-surface rounded-lg px-3 py-2.5 transition-colors ${checked ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'}`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleCampaign(c.id)}
                    className="shrink-0"
                  />
                  {c.source === 'meta' ? (
                    <EntityStatusToggle
                      clientId={clientId}
                      entityType="campaign"
                      metaId={c.meta_campaign_id}
                      status={c.status}
                      onChanged={() => onReloadCampaigns()}
                    />
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor(c.status)}`}>{c.status}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleCampaign(c.id)}
                        className="text-left min-w-0"
                      >
                        <h3 className="font-medium text-foreground text-sm truncate">{c.name}</h3>
                      </button>
                      {c.source === 'meta' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-1 shrink-0">
                          <Link2 className="w-2.5 h-2.5" /> Meta
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.platform} • {c.objective}
                      {c.start_date && ` • ${c.start_date}`}
                      {c.budget > 0 && ` • R$ ${c.budget.toLocaleString('pt-BR')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.source === 'meta' && (
                      <EntityActionsMenu
                        clientId={clientId}
                        entityType="campaign"
                        metaId={c.meta_campaign_id}
                        status={c.status}
                        onChanged={() => onReloadCampaigns()}
                      />
                    )}
                    {c.source !== 'meta' && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenEditCampaign(c)}><Edit2 className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={(e) => onDeleteCampaign(c.id, e)}><Trash2 className="w-3 h-3" /></Button>
                      </>
                    )}
                  </div>
                </div>
                {c.source === 'meta' && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border/50 text-[11px] pl-[68px]">
                    {cells.map((m, i) => (
                      <div key={i} className="min-w-0">
                        <p className="text-muted-foreground truncate">{m.label}</p>
                        <p className={`font-semibold truncate ${m.highlight ? 'text-primary' : 'text-foreground'} ${!hasData ? 'opacity-50' : ''}`}>{m.value}</p>
                      </div>
                    ))}
                    {!hasData && !loadingInsights && (
                      <p className="col-span-full text-[10px] text-muted-foreground italic">Sem dados no período</p>
                    )}
                    {loadingInsights && !hasData && (
                      <p className="col-span-full text-[10px] text-muted-foreground">Carregando...</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {level === 'adsets' && (
        <div className="space-y-2">
          {loadingAdsets ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : visibleAdsets.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              {selectedCampaignIds.size > 0
                ? 'Nenhum conjunto encontrado para as campanhas selecionadas. Clique em "Importar" acima.'
                : 'Nenhum conjunto carregado. Clique em "Importar todos" acima.'}
            </p>
          ) : (
            visibleAdsets.map(a => {
              const checked = selectedAdSetIds.has(a.id);
              const budget = (a.daily_budget || 0) > 0 ? `R$ ${Number(a.daily_budget).toLocaleString('pt-BR')}/dia`
                : (a.lifetime_budget || 0) > 0 ? `R$ ${Number(a.lifetime_budget).toLocaleString('pt-BR')} total` : '—';
              const ins = insightsFromAdSet(a);
              const cells = metricsForObjective(objectiveFor(a.campaign_id), ins, a.name);
              const hasMetrics = ins.spend > 0 || ins.impressions > 0;
              return (
                <div
                  key={a.id}
                  className={`glass-surface rounded-lg px-3 py-2.5 transition-colors ${checked ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={checked} onCheckedChange={() => toggleAdSet(a.id)} className="shrink-0" />
                    <EntityStatusToggle
                      clientId={clientId}
                      entityType="adset"
                      metaId={a.meta_adset_id}
                      status={a.status}
                      onChanged={() => loadAllAdsets()}
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleAdSet(a.id)}
                        className="text-left text-sm font-medium text-foreground truncate block w-full"
                      >
                        {a.name}
                      </button>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {budget} • {a.optimization_goal || '—'}
                      </p>
                    </div>
                    <EntityActionsMenu
                      clientId={clientId}
                      entityType="adset"
                      metaId={a.meta_adset_id}
                      status={a.status}
                      onChanged={() => loadAllAdsets()}
                    />
                  </div>
                  {hasMetrics ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border/50 text-[11px] pl-[68px]">
                      {cells.map((m, i) => (
                        <div key={i} className="min-w-0">
                          <p className="text-muted-foreground truncate">{m.label}</p>
                          <p className={`font-semibold truncate ${m.highlight ? 'text-primary' : 'text-foreground'}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic mt-2 pt-2 border-t border-border/50 pl-[68px]">Sem dados no período</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {level === 'ads' && (
        <div>
          {loadingCreatives ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : visibleAds.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nenhum anúncio encontrado. Clique em "Importar anúncios" acima.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleAds.map(cr => {
                const isMeta = cr.source === 'meta';
                const thumb = cr.thumbnail_url || (cr.link && /\.(jpg|jpeg|png|webp|gif)/i.test(cr.link) ? cr.link : null);
                const ins: CampaignInsights = {
                  spend: Number(cr.spend) || 0,
                  impressions: Number(cr.impressions) || 0,
                  clicks: Number(cr.clicks) || 0,
                  ctr: Number(cr.ctr) || 0,
                  cpc: Number(cr.cpc) || 0,
                  cpm: Number(cr.cpm) || 0,
                  reach: Number(cr.reach) || 0,
                  leads: Number(cr.leads) || 0,
                  purchases: Number(cr.purchases) || 0,
                  messages: Number(cr.messages) || 0,
                  link_clicks: Number(cr.link_clicks) || 0,
                  revenue: Number(cr.revenue) || 0,
                  cpl: Number(cr.leads) > 0 ? Number(cr.spend) / Number(cr.leads) : 0,
                  cpp: Number(cr.purchases) > 0 ? Number(cr.spend) / Number(cr.purchases) : 0,
                  cpm_msg: Number(cr.messages) > 0 ? Number(cr.spend) / Number(cr.messages) : 0,
                  roas: Number(cr.roas) || 0,
                  engagements: Number(cr.engagements) || 0,
                  frequency: Number(cr.frequency) || 0,
                  cost_per_engagement: Number(cr.engagements) > 0 ? Number(cr.spend) / Number(cr.engagements) : 0,
                };
                const cells = metricsForObjective(objectiveFor(cr.campaign_id), ins, cr.name);
                const hasMetrics = ins.spend > 0 || ins.impressions > 0;
                return (
                  <div key={cr.id} className="bg-secondary/30 border border-border/50 rounded-lg overflow-hidden group hover:border-primary/30 transition-colors flex flex-col">
                    {thumb ? (
                      <button type="button" onClick={() => onPreviewCreative(cr)} className="aspect-square bg-secondary/50 relative overflow-hidden block w-full">
                        <img src={thumb} alt={cr.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                        {isMeta && <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground font-semibold">Meta</span>}
                      </button>
                    ) : (
                      <button type="button" onClick={() => onPreviewCreative(cr)} className="aspect-square bg-secondary/50 flex items-center justify-center relative w-full">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                        {isMeta && <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground font-semibold">Meta</span>}
                      </button>
                    )}
                    <div className="p-3 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground line-clamp-2 flex-1">{cr.title || cr.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusColor(cr.status)}`}>{cr.status}</span>
                          {isMeta && (
                            <EntityActionsMenu
                              clientId={clientId}
                              entityType="ad"
                              metaId={cr.meta_ad_id}
                              status={cr.status}
                              onChanged={() => loadAllCreatives()}
                            />
                          )}
                        </div>
                      </div>
                      {hasMetrics && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-2 pb-2 border-b border-border/50 text-[10px]">
                          {cells.map((m, i) => (
                            <div key={i}>
                              <p className="text-muted-foreground">{m.label}</p>
                              <p className={`font-semibold ${m.highlight ? 'text-primary' : 'text-foreground'}`}>{m.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {!isMeta && cr.body && <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{cr.body}</p>}
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                        <button type="button" onClick={() => onPreviewCreative(cr)} className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                          <ExternalLink className="w-3 h-3 shrink-0" /> Ver criativo
                        </button>
                        {!isMeta && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenEditCreative(cr)}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={() => onDeleteCreative(cr.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
