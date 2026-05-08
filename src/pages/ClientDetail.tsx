import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Edit2, Trash2, Send, Upload, FileText, X, Paperclip, Image, BookOpen, BarChart3, Film, Type as TypeIcon, ExternalLink, Sparkles, Link2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MetaAdsTab from '@/components/MetaAdsTab';
import GoogleAdsTab from '@/components/GoogleAdsTab';
import { DateRangePicker, type DateRangeValue } from '@/components/DateRangePicker';
import { metricsForObjective, type CampaignInsights } from '@/lib/campaignMetrics';
import { exportCampaignsPDF } from '@/lib/exportCampaignsPDF';
import EntityActionsMenu from '@/components/EntityActionsMenu';
import MetaHierarchyTabs from '@/components/MetaHierarchyTabs';

interface AccountIds {
  bm?: string;
  google_ads?: string;
  tiktok_ads?: string;
  linkedin_ads?: string;
  [key: string]: string | undefined;
}

interface Client {
  id: string; name: string; services: string; monthly_fee: number; contract_duration: string; status: string;
  payment_day: number | null; account_ids: AccountIds; verba_mensal: number; niche: string;
}
interface Campaign {
  id: string; name: string; platform: string; objective: string; status: string; start_date: string;
  budget: number; notes: string;
  source?: string; meta_campaign_id?: string | null; meta_ad_account_id?: string | null;
  // Adiciona estes:
  spend?: number; impressions?: number; clicks?: number; ctr?: number; cpc?: number; cpm?: number;
  reach?: number; leads?: number; purchases?: number; messages?: number; link_clicks?: number;
  revenue?: number; cpa?: number; roas?: number;
  last_synced_at?: string | null;
}
interface Note {
  id: string; text: string; created_at: string;
}
interface ClientAttachment {
  id: string; file_name: string; file_url: string; created_at: string; category: string;
}
interface Creative {
  id: string; campaign_id: string; name: string; type: string; link: string; status: string; created_at: string;
  source?: string; thumbnail_url?: string | null; body?: string | null; title?: string | null; meta_ad_id?: string | null;
}

const ATTACHMENT_CATEGORIES = [
  { value: 'criativos', label: 'Criativos', icon: Image, description: 'Peças, artes, vídeos' },
  { value: 'briefings', label: 'Briefings', icon: BookOpen, description: 'Briefings e estratégias' },
  { value: 'relatorios', label: 'Relatórios', icon: BarChart3, description: 'Relatórios enviados' },
  { value: 'outros', label: 'Outros', icon: FileText, description: 'Outros documentos' },
] as const;

const CREATIVE_TYPES = [
  { value: 'video', label: 'Vídeo', icon: Film },
  { value: 'imagem', label: 'Imagem', icon: Image },
  { value: 'copy', label: 'Copy', icon: TypeIcon },
] as const;

const CREATIVE_STATUS = [
  { value: 'teste', label: 'Teste', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'escalando', label: 'Escalando', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'morto', label: 'Morto', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
] as const;

export default function ClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'dados' | 'campanhas' | 'anexos' | 'meta'>('dados');
  const [importingMeta, setImportingMeta] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState('Todas');
  const [campOpen, setCampOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: 'last_30d' });
  const [insightsByCamp, setInsightsByCamp] = useState<Record<string, CampaignInsights>>({});
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campForm, setCampForm] = useState({ name: '', platform: 'Facebook Ads', objective: '', status: 'Ativa', start_date: '', budget: 0, notes: '' });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignDateRange, setCampaignDateRange] = useState<DateRangeValue>({ preset: 'last_30d' });
  const [reloadingCampaign, setReloadingCampaign] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [editClient, setEditClient] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', services: '', monthly_fee: 0, contract_duration: '', status: 'Ativo', payment_day: '' as string, verba_mensal: 0, niche: '', account_ids: {} as AccountIds });
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachCategory, setAttachCategory] = useState('criativos');
  const [attachFilter, setAttachFilter] = useState('todos');

  // Creatives
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativeFilter, setCreativeFilter] = useState<'todos' | 'teste' | 'escalando' | 'morto'>('todos');
  const [creativeOpen, setCreativeOpen] = useState(false);
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [creativeForm, setCreativeForm] = useState({ name: '', type: 'video', link: '', status: 'teste' });

  // Ad Sets (Conjuntos de Anúncio)
  const [adSets, setAdSets] = useState<any[]>([]);
  const [loadingAdSets, setLoadingAdSets] = useState(false);
  const [importingAdSets, setImportingAdSets] = useState(false);
  const [previewCreative, setPreviewCreative] = useState<Creative | null>(null);
  const [previewFormat, setPreviewFormat] = useState<string>('DESKTOP_FEED_STANDARD');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ClientAttachment | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatusFilter, setExportStatusFilter] = useState<'todas' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'>('todas');
  const [exportObjectives, setExportObjectives] = useState<string[]>([]);
  const [exportSelectedIds, setExportSelectedIds] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!previewCreative?.meta_ad_id || !id) { setPreviewHtml(''); return; }
    setPreviewLoading(true);
    setPreviewHtml('');
    supabase.functions.invoke('meta-ad-preview', {
      body: { client_id: id, meta_ad_id: previewCreative.meta_ad_id, format: previewFormat },
    }).then(({ data, error }) => {
      setPreviewLoading(false);
      if (error || data?.error) { setPreviewHtml(''); return; }
      setPreviewHtml(data?.html || '');
    });
  }, [previewCreative?.meta_ad_id, previewFormat, id]);

  const loadClient = async () => {
    const { data } = await supabase.from('clients').select('*').eq('id', id).single();
    if (data) {
      const c: Client = {
        ...(data as any),
        account_ids: (data.account_ids as AccountIds) || {},
        verba_mensal: (data as any).verba_mensal ?? 0,
        niche: (data as any).niche ?? '',
      };
      setClient(c);
      setClientForm({
        name: c.name, services: c.services, monthly_fee: c.monthly_fee, contract_duration: c.contract_duration, status: c.status,
        payment_day: c.payment_day ? String(c.payment_day) : '',
        verba_mensal: c.verba_mensal || 0, niche: c.niche || '',
        account_ids: { bm: '', google_ads: '', tiktok_ads: '', linkedin_ads: '', ...c.account_ids },
      });
    }
  };

  const loadCampaigns = async () => {
    // Buscar conta Meta ativa para filtrar campanhas Meta de outras contas
    const { data: conn } = await supabase.from('meta_connections')
      .select('selected_ad_account_id').eq('client_id', id).maybeSingle();
    const activeAccount = conn?.selected_ad_account_id || null;
    const { data } = await supabase.from('campaigns').select('*').eq('client_id', id).order('created_at', { ascending: false });
    const filtered = (data || []).filter((c: any) =>
      c.source !== 'meta' || !activeAccount || c.meta_ad_account_id === activeAccount
    );
    setCampaigns(filtered.map((c: any) => ({ ...c, budget: c.budget ?? 0, notes: c.notes ?? '' })));
  };

  const loadNotes = async (campId: string) => {
    const { data } = await supabase.from('campaign_notes').select('*').eq('campaign_id', campId).order('created_at', { ascending: true });
    setNotes(data || []);
  };

  const loadAttachments = async () => {
    if (!user) return;
    const { data } = await supabase.from('client_attachments').select('*').eq('client_id', id).eq('user_id', user.id).order('created_at', { ascending: false });
    setAttachments((data || []) as ClientAttachment[]);
  };

  const loadCreatives = async (campId: string) => {
    const { data } = await supabase.from('creatives' as any).select('*').eq('campaign_id', campId).order('created_at', { ascending: false });
    setCreatives((data || []) as unknown as Creative[]);
  };

  const loadAdSets = async (campId: string, autoImportFor?: Campaign) => {
    setLoadingAdSets(true);
    const { data } = await supabase.from('ad_sets' as any).select('*').eq('campaign_id', campId).order('created_at', { ascending: false });
    setAdSets((data || []) as any[]);
    setLoadingAdSets(false);
    if ((!data || data.length === 0) && autoImportFor?.source === 'meta') {
      await importAdSetsFor(autoImportFor);
    }
  };

  const buildPeriodBodyFrom = (r: DateRangeValue) => {
    const body: any = {};
    if (r.preset === 'custom' && r.since && r.until) {
      body.since = r.since;
      body.until = r.until;
    } else {
      body.date_preset = r.preset;
    }
    return body;
  };
  const buildPeriodBody = () => buildPeriodBodyFrom(dateRange);

  const importAdSetsFor = async (camp: Campaign, range?: DateRangeValue) => {
    setImportingAdSets(true);
    toast.loading('Carregando conjuntos de anúncios...', { id: 'adsets' });
    const period = buildPeriodBodyFrom(range || dateRange);
    const { data, error } = await supabase.functions.invoke('meta-import-adsets', {
      body: { client_id: id, campaign_id: camp.id, ...period },
    });
    setImportingAdSets(false);
    if (error || data?.error) {
      toast.error('Falha ao buscar conjuntos de anúncio', { id: 'adsets' });
      return;
    }
    toast.success(`${data?.imported ?? 0} conjuntos importados`, { id: 'adsets' });
    const { data: refreshed } = await supabase.from('ad_sets' as any).select('*').eq('campaign_id', camp.id).order('created_at', { ascending: false });
    setAdSets((refreshed || []) as any[]);
  };

  const importAdSets = async () => {
    if (!selectedCampaign) return;
    await importAdSetsFor(selectedCampaign, campaignDateRange);
  };

  // Recarrega conjuntos + criativos da campanha selecionada para um período específico
  const reloadCampaignForRange = async (camp: Campaign, range: DateRangeValue) => {
    if (camp.source !== 'meta') return;
    setReloadingCampaign(true);
    const period = buildPeriodBodyFrom(range);
    toast.loading('Atualizando métricas do período...', { id: 'camp-range' });
    try {
      // Conjuntos (já recarrega no estado dentro)
      await importAdSetsFor(camp, range);
      // Criativos do cliente (filtrados depois pela campanha)
      await supabase.functions.invoke('meta-import-creatives', {
        body: { client_id: id, ...period },
      });
      await loadCreatives(camp.id);
      toast.success('Métricas atualizadas', { id: 'camp-range' });
    } catch (e) {
      toast.error('Falha ao atualizar métricas', { id: 'camp-range' });
    } finally {
      setReloadingCampaign(false);
    }
  };

  useEffect(() => { loadClient(); loadCampaigns(); loadAttachments(); }, [id]);

  // Buscar insights da Meta para o período selecionado
  const loadInsights = async () => {
    if (!id) return;
    const buildFallback = () => {
      const fb: Record<string, CampaignInsights> = {};
      for (const c of campaigns) {
        if (c.source !== 'meta') continue;
        const spend = Number(c.spend) || 0;
        const leads = Number((c as any).leads) || 0;
        const purchases = Number((c as any).purchases) || 0;
        const messages = Number((c as any).messages) || 0;
        const revenue = Number((c as any).revenue) || 0;
        fb[c.id] = {
          spend,
          impressions: Number(c.impressions) || 0,
          clicks: Number(c.clicks) || 0,
          ctr: Number((c as any).ctr) || 0,
          cpc: Number((c as any).cpc) || 0,
          cpm: Number((c as any).cpm) || 0,
          reach: Number((c as any).reach) || 0,
          leads, purchases, messages,
          link_clicks: Number((c as any).link_clicks) || 0,
          revenue,
          cpl: leads > 0 ? spend / leads : 0,
          cpp: purchases > 0 ? spend / purchases : 0,
          cpm_msg: messages > 0 ? spend / messages : 0,
          roas: spend > 0 ? revenue / spend : 0,
        };
      }
      return fb;
    };

    const metaCampaigns = campaigns.filter(c => c.source === 'meta' && c.meta_campaign_id);
    if (metaCampaigns.length === 0) {
      setInsightsByCamp(buildFallback());
      return;
    }

    setLoadingInsights(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-campaign-insights', {
        body: {
          client_id: id,
          campaign_ids: metaCampaigns.map(c => c.meta_campaign_id),
          ...buildPeriodBody(),
        },
      });
      if (error) throw error;

      // IMPORTANTE: quando a Meta responde para o período selecionado, NÃO usamos o
      // fallback (gasto cumulativo armazenado no banco). Campanhas sem insight no
      // período devem ficar zeradas, caso contrário aparecem gastos "fantasma" de
      // campanhas pausadas que não tiveram entrega no período filtrado.
      const ZERO: CampaignInsights = {
        spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0,
        leads: 0, purchases: 0, messages: 0, link_clicks: 0, revenue: 0,
        cpl: 0, cpp: 0, cpm_msg: 0, roas: 0,
        engagements: 0, frequency: 0, cost_per_engagement: 0,
        followers: 0, profile_visits: 0, cost_per_follower: 0,
      };
      const mapped: Record<string, CampaignInsights> = {};
      for (const c of campaigns) {
        if (c.source !== 'meta') continue;
        if (c.meta_campaign_id && (data as any)?.insights?.[c.meta_campaign_id]) {
          mapped[c.id] = (data as any).insights[c.meta_campaign_id];
        } else {
          mapped[c.id] = ZERO;
        }
      }
      setInsightsByCamp(mapped);
    } catch (e) {
      console.error('[loadInsights] erro:', e);
      setInsightsByCamp(buildFallback());
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => { loadInsights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaigns.length, dateRange.preset, dateRange.since, dateRange.until]);

  // ---- Auto-sync de conjuntos e anúncios em background ----
  // Sempre que entramos na tela (ou trocamos o período), disparamos meta-import-adsets
  // e meta-import-creatives em paralelo para garantir que os dados de conjuntos e
  // criativos venham atualizados sem precisar clicar em "Importar". Usa um sessionStorage
  // de "last sync" por cliente+período para evitar refazer a importação a cada
  // re-render (TTL de 60s). O resultado dispara um evento que o MetaHierarchyTabs
  // escuta para recarregar do banco.
  const AUTO_SYNC_TTL_MS = 60_000;
  useEffect(() => {
    if (!id) return;
    const metaCampaigns = campaigns.filter(c => c.source === 'meta' && c.meta_campaign_id);
    if (metaCampaigns.length === 0) return;
    const periodKey = dateRange.preset === 'custom'
      ? `custom:${dateRange.since}:${dateRange.until}`
      : (dateRange.preset || 'maximum');
    const cacheKey = `meta-auto-sync:${id}:${periodKey}`;
    try {
      const last = Number(sessionStorage.getItem(cacheKey) || 0);
      if (last && Date.now() - last < AUTO_SYNC_TTL_MS) return; // já sincronizado recentemente
    } catch { /* ignore */ }

    let cancelled = false;
    (async () => {
      try {
        const period = buildPeriodBodyFrom(dateRange);
        const [adsetsRes, creativesRes] = await Promise.allSettled([
          supabase.functions.invoke('meta-import-adsets', { body: { client_id: id, ...period } }),
          supabase.functions.invoke('meta-import-creatives', { body: { client_id: id, ...period } }),
        ]);
        if (cancelled) return;
        try { sessionStorage.setItem(cacheKey, String(Date.now())); } catch { /* ignore */ }
        const ok = (r: PromiseSettledResult<any>) =>
          r.status === 'fulfilled' && !r.value?.error && !r.value?.data?.error;
        if (ok(adsetsRes) || ok(creativesRes)) {
          // Avisa o MetaHierarchyTabs para recarregar do banco silenciosamente.
          window.dispatchEvent(new CustomEvent('meta-auto-sync-done', { detail: { clientId: id } }));
        }
      } catch (e) {
        console.warn('[auto-sync meta] falhou:', e);
      }
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id, campaigns.length, dateRange.preset, dateRange.since, dateRange.until]);

  const saveClient = async () => {
    await supabase.from('clients').update({
      name: clientForm.name, services: clientForm.services, monthly_fee: clientForm.monthly_fee,
      contract_duration: clientForm.contract_duration, status: clientForm.status,
      payment_day: clientForm.payment_day ? Number(clientForm.payment_day) : null,
      account_ids: clientForm.account_ids,
      verba_mensal: clientForm.verba_mensal,
      niche: clientForm.niche,
    } as any).eq('id', id);
    toast.success('Cliente atualizado!');
    setEditClient(false);
    loadClient();
  };

  const openNewCampaign = () => {
    setEditingCampaign(null);
    setCampForm({ name: '', platform: 'Facebook Ads', objective: '', status: 'Ativa', start_date: '', budget: 0, notes: '' });
    setCampOpen(true);
  };

  const openEditCampaign = (c: Campaign, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCampaign(c);
    setCampForm({ name: c.name, platform: c.platform, objective: c.objective, status: c.status, start_date: c.start_date, budget: c.budget || 0, notes: c.notes || '' });
    setCampOpen(true);
  };

  const saveCampaign = async () => {
    if (!user) return;
    if (editingCampaign) {
      await supabase.from('campaigns').update(campForm as any).eq('id', editingCampaign.id);
      toast.success('Campanha atualizada!');
      if (selectedCampaign?.id === editingCampaign.id) setSelectedCampaign({ ...selectedCampaign, ...campForm });
    } else {
      await supabase.from('campaigns').insert({ ...campForm, client_id: id, user_id: user.id } as any);
      toast.success('Campanha criada!');
    }
    setCampOpen(false);
    loadCampaigns();
  };

  const deleteCampaign = async (campId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await supabase.from('campaigns').delete().eq('id', campId);
    toast.success('Campanha removida!');
    if (selectedCampaign?.id === campId) setSelectedCampaign(null);
    loadCampaigns();
  };

  const openSelectedCampaign = (c: Campaign) => {
    setSelectedCampaign(c);
    setCampaignDateRange(dateRange);
    loadNotes(c.id);
    loadCreatives(c.id);
    loadAdSets(c.id, c);
  };

  const sendNote = async () => {
    if (!selectedCampaign || !noteText.trim() || !user) return;
    await supabase.from('campaign_notes').insert({ campaign_id: selectedCampaign.id, user_id: user.id, text: noteText });
    setNoteText('');
    loadNotes(selectedCampaign.id);
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('campaign_notes').delete().eq('id', noteId);
    if (selectedCampaign) loadNotes(selectedCampaign.id);
  };

  // Creatives CRUD
  const openNewCreative = () => {
    setEditingCreative(null);
    setCreativeForm({ name: '', type: 'video', link: '', status: 'teste' });
    setCreativeOpen(true);
  };

  const openEditCreative = (cr: Creative) => {
    setEditingCreative(cr);
    setCreativeForm({ name: cr.name, type: cr.type, link: cr.link || '', status: cr.status });
    setCreativeOpen(true);
  };

  const saveCreative = async () => {
    if (!user || !selectedCampaign) return;
    if (!creativeForm.name.trim()) { toast.error('Informe o nome do criativo'); return; }
    if (editingCreative) {
      await supabase.from('creatives' as any).update(creativeForm as any).eq('id', editingCreative.id);
      toast.success('Criativo atualizado!');
    } else {
      await supabase.from('creatives' as any).insert({ ...creativeForm, campaign_id: selectedCampaign.id, user_id: user.id } as any);
      toast.success('Criativo adicionado!');
    }
    setCreativeOpen(false);
    loadCreatives(selectedCampaign.id);
  };

  const deleteCreative = async (crId: string) => {
    await supabase.from('creatives' as any).delete().eq('id', crId);
    toast.success('Criativo removido!');
    if (selectedCampaign) loadCreatives(selectedCampaign.id);
  };

  const handleFileUpload = async (file: File) => {
    if (!user || !id) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('client-attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('client-attachments').getPublicUrl(filePath);
      await supabase.from('client_attachments').insert({
        client_id: id, user_id: user.id, file_name: file.name, file_url: urlData.publicUrl, category: attachCategory,
      });
      toast.success('Arquivo anexado!');
      loadAttachments();
    } catch {
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: ClientAttachment) => {
    await supabase.from('client_attachments').delete().eq('id', att.id);
    toast.success('Anexo removido!');
    loadAttachments();
  };

  const filtered = filter === 'Todas' ? campaigns : campaigns.filter(c => c.status === filter);
  const filteredAttachments = attachFilter === 'todos' ? attachments : attachments.filter(a => a.category === attachFilter);
  const filteredCreatives = creativeFilter === 'todos' ? creatives : creatives.filter(c => c.status === creativeFilter);

  const statusColor = (s: string) => {
    if (s === 'Ativo' || s === 'Ativa') return 'bg-emerald-500/20 text-emerald-400';
    if (s === 'Pausado' || s === 'Pausada') return 'bg-amber-500/20 text-amber-400';
    return 'bg-red-500/20 text-red-400';
  };

  const updateAccountId = (key: string, value: string) => {
    setClientForm(prev => ({ ...prev, account_ids: { ...prev.account_ids, [key]: value } }));
  };

  const getCategoryIcon = (cat: string) => {
    const found = ATTACHMENT_CATEGORIES.find(c => c.value === cat);
    if (!found) return FileText;
    return found.icon;
  };

  const getCreativeTypeIcon = (t: string) => CREATIVE_TYPES.find(c => c.value === t)?.icon || FileText;
  const getCreativeStatusBadge = (s: string) => CREATIVE_STATUS.find(c => c.value === s);

  if (!client) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(client.status)}`}>{client.status}</span>
            {client.niche && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">{client.niche}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit flex-wrap">
        <button onClick={() => setTab('dados')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'dados' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Dados do Cliente</button>
        <button onClick={() => { setTab('campanhas'); setSelectedCampaign(null); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'campanhas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Campanhas</button>
        <button onClick={() => setTab('meta')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'meta' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Meta Ads</button>
        <button onClick={() => setTab('anexos')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'anexos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Anexos {attachments.length > 0 && <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{attachments.length}</span>}
        </button>
      </div>

      {/* Meta Ads Tab */}
      {tab === 'meta' && id && <MetaAdsTab clientId={id} onCampaignsImported={() => { loadCampaigns(); setTab('campanhas'); }} />}

      {/* Google Ads Tab */}
      {tab === 'google' && id && <GoogleAdsTab clientId={id} />}

      {/* Dados Tab */}
      {tab === 'dados' && (
        <div className="glass-surface rounded-xl p-6 space-y-4">
          {!editClient ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-secondary/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Nicho</p>
                  <p className="text-foreground font-semibold mt-1 text-sm">{client.niche || '—'}</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                  <p className="text-xs text-muted-foreground">Verba mensal</p>
                  <p className="text-primary font-bold mt-1">R$ {(client.verba_mensal || 0).toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Fee mensal</p>
                  <p className="text-foreground font-semibold mt-1">R$ {client.monthly_fee?.toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="text-foreground font-semibold mt-1 text-sm">{client.payment_day ? `Dia ${client.payment_day}` : '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm pt-2">
                <div><span className="text-muted-foreground">Serviços:</span><p className="text-foreground mt-1">{client.services || '—'}</p></div>
                <div><span className="text-muted-foreground">Duração:</span><p className="text-foreground mt-1">{client.contract_duration || '—'}</p></div>
              </div>

              {/* Account IDs display */}
              {Object.entries(client.account_ids || {}).some(([, v]) => v) && (
                <div className="pt-3 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-2">IDs das Contas</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {client.account_ids.bm && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">BM:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.bm}</p></div>}
                    {client.account_ids.google_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">Google Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.google_ads}</p></div>}
                    {client.account_ids.tiktok_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">TikTok Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.tiktok_ads}</p></div>}
                    {client.account_ids.linkedin_ads && <div className="bg-secondary/30 rounded-lg px-3 py-2 text-sm"><span className="text-muted-foreground text-xs">LinkedIn Ads:</span><p className="text-foreground font-mono text-xs mt-0.5">{client.account_ids.linkedin_ads}</p></div>}
                  </div>
                </div>
              )}

              <Button variant="outline" onClick={() => setEditClient(true)} className="gap-2"><Edit2 className="w-3 h-3" /> Editar</Button>
            </>
          ) : (
            <div className="space-y-3">
              <div><Label className="text-muted-foreground text-sm">Nome</Label><Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-sm">Nicho</Label><Input value={clientForm.niche} onChange={(e) => setClientForm({ ...clientForm, niche: e.target.value })} placeholder="Ex: Estética" className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label className="text-muted-foreground text-sm">Verba mensal (R$)</Label><Input type="number" value={clientForm.verba_mensal} onChange={(e) => setClientForm({ ...clientForm, verba_mensal: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              </div>
              <div><Label className="text-muted-foreground text-sm">Serviços</Label><Textarea value={clientForm.services} onChange={(e) => setClientForm({ ...clientForm, services: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-sm">Fee mensal (R$)</Label><Input type="number" value={clientForm.monthly_fee} onChange={(e) => setClientForm({ ...clientForm, monthly_fee: Number(e.target.value) })} className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div><Label className="text-muted-foreground text-sm">Duração</Label><Input value={clientForm.contract_duration} onChange={(e) => setClientForm({ ...clientForm, contract_duration: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-sm">Dia de pagamento</Label><Input type="number" min={1} max={31} value={clientForm.payment_day} onChange={(e) => setClientForm({ ...clientForm, payment_day: e.target.value })} placeholder="Ex: 10" className="bg-secondary/50 border-border/50 mt-1" /></div>
                <div>
                  <Label className="text-muted-foreground text-sm">Status</Label>
                  <Select value={clientForm.status} onValueChange={(v) => setClientForm({ ...clientForm, status: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Pausado">Pausado</SelectItem>
                      <SelectItem value="Encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3 pt-2 border-t border-border">
                <Label className="text-foreground text-sm font-semibold">IDs das Contas</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-muted-foreground text-xs">BM</Label><Input value={clientForm.account_ids.bm || ''} onChange={(e) => updateAccountId('bm', e.target.value)} placeholder="ID da BM" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">Google Ads</Label><Input value={clientForm.account_ids.google_ads || ''} onChange={(e) => updateAccountId('google_ads', e.target.value)} placeholder="ID Google Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">TikTok Ads</Label><Input value={clientForm.account_ids.tiktok_ads || ''} onChange={(e) => updateAccountId('tiktok_ads', e.target.value)} placeholder="ID TikTok Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                  <div><Label className="text-muted-foreground text-xs">LinkedIn Ads</Label><Input value={clientForm.account_ids.linkedin_ads || ''} onChange={(e) => updateAccountId('linkedin_ads', e.target.value)} placeholder="ID LinkedIn Ads" className="bg-secondary/50 border-border/50 mt-1 text-sm" /></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveClient} className="neon-glow">Salvar</Button>
                <Button variant="ghost" onClick={() => setEditClient(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Campanhas Tab - hierarquia Meta (Campanhas > Conjuntos > Anúncios) */}
      {tab === 'campanhas' && id && (
        <MetaHierarchyTabs
          clientId={id}
          campaigns={campaigns as any}
          insightsByCamp={insightsByCamp}
          loadingInsights={loadingInsights}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReloadCampaigns={loadCampaigns}
          onOpenNewCampaign={openNewCampaign}
          onOpenEditCampaign={(c) => openEditCampaign(c as any)}
          onDeleteCampaign={(cid, e) => deleteCampaign(cid, e)}
          onOpenNewCreative={() => openNewCreative()}
          onOpenEditCreative={(cr) => openEditCreative(cr as any)}
          onDeleteCreative={(crId) => deleteCreative(crId)}
          onPreviewCreative={(cr) => setPreviewCreative(cr as any)}
          buildPeriodBody={buildPeriodBody}
          importingMeta={importingMeta}
          onImportFromMeta={async () => {
            setImportingMeta(true);
            const { data, error } = await supabase.functions.invoke('meta-import-campaigns', {
              body: { client_id: id, ...buildPeriodBody() },
            });
            setImportingMeta(false);
            if (error || data?.error) {
              const msg = (data?.error || error?.message || '').toString();
              if (msg.includes('no_connection')) toast.error('Conecte a Meta Ads na aba "Meta Ads" primeiro');
              else if (msg.includes('no_selected_account')) toast.error('Selecione uma conta de anúncio na aba "Meta Ads"');
              else toast.error('Falha ao importar: ' + msg);
              return;
            }
            toast.success(`${data.imported} campanhas importadas da Meta`);
            loadCampaigns();
          }}
          onExportPDF={() => {
            if (campaigns.length === 0) { toast.error('Nenhuma campanha para exportar'); return; }
            setExportStatusFilter('todas');
            setExportObjectives([]);
            setExportSelectedIds(Object.fromEntries(campaigns.map(c => [c.id, true])));
            setExportOpen(true);
          }}
        />
      )}

      {/* Anexos Tab */}
      {tab === 'anexos' && (
        <div className="space-y-4">
          <div className="glass-surface rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><Paperclip className="w-4 h-4 text-primary" /> Anexos do Cliente</h3>
            </div>

            <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-secondary/30 rounded-lg border border-border/50">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-muted-foreground text-xs mb-1 block">Categoria do arquivo</Label>
                <Select value={attachCategory} onValueChange={setAttachCategory}>
                  <SelectTrigger className="bg-secondary/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {ATTACHMENT_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <span className="flex items-center gap-2"><cat.icon className="w-3 h-3" /> {cat.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} disabled={uploading} />
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                </div>
              </label>
            </div>

            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg mb-4 flex-wrap">
              <button onClick={() => setAttachFilter('todos')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${attachFilter === 'todos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Todos ({attachments.length})
              </button>
              {ATTACHMENT_CATEGORIES.map(cat => {
                const count = attachments.filter(a => a.category === cat.value).length;
                return (
                  <button key={cat.value} onClick={() => setAttachFilter(cat.value)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${attachFilter === cat.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    <cat.icon className="w-3 h-3" /> {cat.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>

            {filteredAttachments.length > 0 ? (
              <div className="space-y-2">
                {filteredAttachments.map(att => {
                  const CatIcon = getCategoryIcon(att.category);
                  return (
                    <div key={att.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 group hover:bg-secondary/50 transition-colors">
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(att)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <CatIcon className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <span className="text-sm text-foreground hover:text-primary truncate block">{att.file_name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {ATTACHMENT_CATEGORIES.find(c => c.value === att.category)?.label || 'Outros'}
                            </span>
                            <span className="text-xs text-muted-foreground">{new Date(att.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <a
                          href={att.file_url}
                          download={att.file_name}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button onClick={() => removeAttachment(att)} className="p-2 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" title="Remover"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {attachFilter === 'todos' ? 'Nenhum arquivo anexado.' : `Nenhum arquivo em "${ATTACHMENT_CATEGORIES.find(c => c.value === attachFilter)?.label}".`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Create/Edit Dialog */}
      <Dialog open={campOpen} onOpenChange={setCampOpen}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Nome</Label><Input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Plataforma</Label>
                <Select value={campForm.platform} onValueChange={(v) => setCampForm({ ...campForm, platform: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {['Facebook Ads', 'Google Ads', 'TikTok Ads', 'LinkedIn Ads'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Status</Label>
                <Select value={campForm.status} onValueChange={(v) => setCampForm({ ...campForm, status: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Ativa">Ativa</SelectItem>
                    <SelectItem value="Pausada">Pausada</SelectItem>
                    <SelectItem value="Encerrada">Encerrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-muted-foreground text-sm">Objetivo</Label><Input value={campForm.objective} onChange={(e) => setCampForm({ ...campForm, objective: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-muted-foreground text-sm">Orçamento (R$)</Label><Input type="number" value={campForm.budget} onChange={(e) => setCampForm({ ...campForm, budget: Number(e.target.value) })} placeholder="Ex: 3000" className="bg-secondary/50 border-border/50 mt-1" /></div>
              <div><Label className="text-muted-foreground text-sm">Data de início</Label><Input type="date" value={campForm.start_date} onChange={(e) => setCampForm({ ...campForm, start_date: e.target.value })} className="bg-secondary/50 border-border/50 mt-1" /></div>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Observação / Estratégia</Label>
              <Textarea value={campForm.notes} onChange={(e) => setCampForm({ ...campForm, notes: e.target.value })} placeholder="Estratégia, anotações, decisões..." rows={4} className="bg-secondary/50 border-border/50 mt-1" />
            </div>
            <Button onClick={saveCampaign} className="w-full neon-glow">{editingCampaign ? 'Salvar Alterações' : 'Criar Campanha'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Creative Create/Edit Dialog */}
      <Dialog open={creativeOpen} onOpenChange={setCreativeOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editingCreative ? 'Editar Criativo' : 'Novo Criativo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-muted-foreground text-sm">Nome do criativo</Label><Input value={creativeForm.name} onChange={(e) => setCreativeForm({ ...creativeForm, name: e.target.value })} placeholder="Ex: VSL_v3_dor_cabeça" className="bg-secondary/50 border-border/50 mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-sm">Tipo</Label>
                <Select value={creativeForm.type} onValueChange={(v) => setCreativeForm({ ...creativeForm, type: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CREATIVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Status</Label>
                <Select value={creativeForm.status} onValueChange={(v) => setCreativeForm({ ...creativeForm, status: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border/50 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CREATIVE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-muted-foreground text-sm">Link (Drive, URL...)</Label><Input value={creativeForm.link} onChange={(e) => setCreativeForm({ ...creativeForm, link: e.target.value })} placeholder="https://drive.google.com/..." className="bg-secondary/50 border-border/50 mt-1" /></div>
            <Button onClick={saveCreative} className="w-full neon-glow">{editingCreative ? 'Salvar Alterações' : 'Adicionar Criativo'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview do criativo em alta resolução */}
      <Dialog open={!!previewCreative} onOpenChange={(o) => !o && setPreviewCreative(null)}>
        <DialogContent className="max-w-4xl bg-card/95 backdrop-blur border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground pr-6">{previewCreative?.title || previewCreative?.name}</DialogTitle>
          </DialogHeader>
          {previewCreative && (
            <div className="space-y-3">
              {previewCreative.source === 'meta' && previewCreative.meta_ad_id && (
                <div className="flex flex-wrap gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
                  {[
                    { v: 'DESKTOP_FEED_STANDARD', l: 'Feed Desktop' },
                    { v: 'MOBILE_FEED_STANDARD', l: 'Feed Mobile' },
                    { v: 'INSTAGRAM_STANDARD', l: 'Instagram Feed' },
                    { v: 'INSTAGRAM_STORY', l: 'Stories' },
                    { v: 'INSTAGRAM_REELS', l: 'Reels' },
                  ].map(f => (
                    <button
                      key={f.v}
                      onClick={() => setPreviewFormat(f.v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewFormat === f.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>
              )}

              {previewCreative.source === 'meta' && previewCreative.meta_ad_id ? (
                <div className="bg-secondary/30 rounded-lg overflow-hidden flex items-center justify-center min-h-[500px]">
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-12">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando preview da Meta...
                    </div>
                  ) : previewHtml ? (
                    (() => {
                      const isVertical = previewFormat.includes('STORY') || previewFormat.includes('REELS');
                      return (
                        <iframe
                          title="Meta Ad Preview"
                          srcDoc={previewHtml}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                          scrolling="no"
                          className="border-0 bg-background"
                          style={
                            isVertical
                              ? { width: '360px', height: '720px', maxWidth: '100%' }
                              : { width: '100%', height: '600px' }
                          }
                        />
                      );
                    })()
                  ) : previewCreative.thumbnail_url ? (
                    <img src={previewCreative.thumbnail_url} alt={previewCreative.name} className="max-w-full max-h-[70vh] object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground py-12">Preview indisponível</p>
                  )}
                </div>
              ) : previewCreative.thumbnail_url ? (
                <div className="bg-secondary/30 rounded-lg overflow-hidden flex items-center justify-center max-h-[70vh]">
                  <img src={previewCreative.thumbnail_url} alt={previewCreative.name} className="max-w-full max-h-[70vh] object-contain" />
                </div>
              ) : (
                <div className="aspect-video bg-secondary/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                  Sem prévia disponível
                </div>
              )}

              {previewCreative.body && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{previewCreative.body}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={(o) => !o && setPreviewAttachment(null)}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8 truncate">
              <Paperclip className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{previewAttachment?.file_name}</span>
            </DialogTitle>
          </DialogHeader>
          {previewAttachment && (() => {
            const url = previewAttachment.file_url;
            const name = previewAttachment.file_name.toLowerCase();
            const ext = name.split('.').pop() || '';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext);
            const isVideo = ['mp4', 'webm', 'mov', 'm4v', 'ogg'].includes(ext);
            const isAudio = ['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(ext);
            const isPdf = ext === 'pdf';
            return (
              <div className="flex flex-col gap-3 min-h-0">
                <div className="bg-secondary/30 rounded-lg overflow-hidden flex items-center justify-center min-h-[300px] max-h-[70vh]">
                  {isImage ? (
                    <img src={url} alt={previewAttachment.file_name} className="max-w-full max-h-[70vh] object-contain" />
                  ) : isVideo ? (
                    <video src={url} controls className="max-w-full max-h-[70vh]" />
                  ) : isAudio ? (
                    <audio src={url} controls className="w-full px-6" />
                  ) : isPdf ? (
                    <iframe src={url} title={previewAttachment.file_name} className="w-full h-[70vh] border-0 bg-white" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-12 text-center px-6">
                      <FileText className="w-12 h-12 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Pré-visualização não disponível para este tipo de arquivo.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/60 text-foreground text-sm font-medium hover:bg-secondary transition-colors border border-border/50"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir em nova aba
                  </a>
                  <a
                    href={url}
                    download={previewAttachment.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-4 h-4" /> Baixar
                  </a>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Export PDF Selection Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Exportar PDF — escolher campanhas</DialogTitle>
          </DialogHeader>

          {(() => {
            const allObjectives = Array.from(new Set(campaigns.map(c => c.objective).filter(Boolean))) as string[];
            const matchesFilters = (c: Campaign) => {
              const statusOk = exportStatusFilter === 'todas'
                || (c.status || '').toUpperCase() === exportStatusFilter
                || (exportStatusFilter === 'ACTIVE' && /ativa/i.test(c.status || ''))
                || (exportStatusFilter === 'PAUSED' && /pausada/i.test(c.status || ''))
                || (exportStatusFilter === 'ARCHIVED' && /(encerrada|arquivada)/i.test(c.status || ''));
              const objOk = exportObjectives.length === 0 || exportObjectives.includes(c.objective || '');
              return statusOk && objOk;
            };
            const visible = campaigns.filter(matchesFilters);
            const selectedCount = visible.filter(c => exportSelectedIds[c.id]).length;
            const allSelected = visible.length > 0 && selectedCount === visible.length;

            return (
              <>
                <div className="space-y-4 overflow-y-auto pr-1">
                  {/* Filtro de status */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Status</Label>
                    <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
                      {([
                        { v: 'todas', l: 'Todas' },
                        { v: 'ACTIVE', l: 'Ativas' },
                        { v: 'PAUSED', l: 'Pausadas' },
                        { v: 'ARCHIVED', l: 'Encerradas' },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          onClick={() => setExportStatusFilter(opt.v)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${exportStatusFilter === opt.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtro de objetivo */}
                  {allObjectives.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">
                        Objetivo {exportObjectives.length > 0 && `(${exportObjectives.length} selecionado(s))`}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {allObjectives.map(obj => {
                          const active = exportObjectives.includes(obj);
                          return (
                            <button
                              key={obj}
                              onClick={() => setExportObjectives(prev => active ? prev.filter(o => o !== obj) : [...prev, obj])}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                            >
                              {obj}
                            </button>
                          );
                        })}
                        {exportObjectives.length > 0 && (
                          <button onClick={() => setExportObjectives([])} className="text-xs px-2.5 py-1 rounded-full text-muted-foreground hover:text-foreground">
                            Limpar
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lista de campanhas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs text-muted-foreground">
                        Campanhas ({selectedCount}/{visible.length} selecionadas)
                      </Label>
                      <button
                        onClick={() => {
                          const next = { ...exportSelectedIds };
                          visible.forEach(c => { next[c.id] = !allSelected; });
                          setExportSelectedIds(next);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
                      </button>
                    </div>
                    <div className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
                      {visible.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">Nenhuma campanha corresponde aos filtros.</p>
                      ) : visible.map(c => (
                        <label key={c.id} className="flex items-center gap-3 p-3 hover:bg-secondary/40 cursor-pointer">
                          <Checkbox
                            checked={!!exportSelectedIds[c.id]}
                            onCheckedChange={(v) => setExportSelectedIds(prev => ({ ...prev, [c.id]: !!v }))}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.objective || '—'} • {c.status || '—'}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>Cancelar</Button>
                  <Button
                    disabled={exporting || selectedCount === 0 || !client}
                    onClick={async () => {
                      if (!client) return;
                      const chosen = visible.filter(c => exportSelectedIds[c.id]);
                      if (chosen.length === 0) { toast.error('Selecione ao menos 1 campanha'); return; }
                      const periodLabel = dateRange.preset === 'custom' && dateRange.since && dateRange.until
                        ? `${dateRange.since} → ${dateRange.until}`
                        : ({
                            today: 'Hoje',
                            yesterday: 'Ontem',
                            last_7d: 'Últimos 7 dias',
                            last_14d: 'Últimos 14 dias',
                            last_30d: 'Últimos 30 dias',
                            last_90d: 'Últimos 90 dias',
                            this_week: 'Esta semana',
                            last_week: 'Semana passada',
                            this_month: 'Este mês',
                            last_month: 'Mês passado',
                            maximum: 'Máximo',
                          } as Record<string, string>)[dateRange.preset] || dateRange.preset;
                      setExporting(true);
                      toast.loading('Gerando PDF...', { id: 'pdf' });
                      try {
                        await exportCampaignsPDF({ clientName: client.name, periodLabel, campaigns: chosen });
                        toast.success(`PDF com ${chosen.length} campanha(s) gerado!`, { id: 'pdf' });
                        setExportOpen(false);
                      } catch (e: any) {
                        toast.error('Falha ao gerar PDF: ' + (e?.message || 'erro'), { id: 'pdf' });
                      } finally {
                        setExporting(false);
                      }
                    }}
                    className="gap-2"
                  >
                    {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    Exportar {selectedCount > 0 ? `(${selectedCount})` : ''}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
