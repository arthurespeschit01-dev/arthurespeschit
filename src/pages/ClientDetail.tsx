import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Edit2, Trash2, Send, Upload, FileText, X, Paperclip, Image, BookOpen, BarChart3, Film, Type as TypeIcon, ExternalLink, Sparkles, Link2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MetaAdsTab from '@/components/MetaAdsTab';
import { DateRangePicker, type DateRangeValue } from '@/components/DateRangePicker';
import { metricsForObjective, type CampaignInsights } from '@/lib/campaignMetrics';

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
  source?: string; meta_campaign_id?: string | null;
  spend?: number; impressions?: number; clicks?: number; cpa?: number; roas?: number;
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

  const loadAdSets = async (campId: string) => {
    setLoadingAdSets(true);
    const { data } = await supabase.from('ad_sets' as any).select('*').eq('campaign_id', campId).order('created_at', { ascending: false });
    setAdSets((data || []) as any[]);
    setLoadingAdSets(false);
  };

  const importAdSets = async () => {
    if (!selectedCampaign) return;
    setImportingAdSets(true);
    toast.loading('Carregando conjuntos de anúncios...', { id: 'adsets' });
    const { data, error } = await supabase.functions.invoke('meta-import-adsets', {
      body: { client_id: id, campaign_id: selectedCampaign.id },
    });
    setImportingAdSets(false);
    if (error || data?.error) {
      toast.error('Falha ao buscar conjuntos de anúncio', { id: 'adsets' });
      return;
    }
    toast.success(`${data?.imported ?? 0} conjuntos importados`, { id: 'adsets' });
    loadAdSets(selectedCampaign.id);
  };

  useEffect(() => { loadClient(); loadCampaigns(); loadAttachments(); }, [id]);

  // Buscar insights da Meta para o período selecionado
  const loadInsights = async () => {
    if (!id) return;
    const hasMeta = campaigns.some(c => c.source === 'meta');
    if (!hasMeta) { setInsightsByCamp({}); return; }
    setLoadingInsights(true);
    const body: any = { client_id: id };
    if (dateRange.preset === 'custom' && dateRange.since && dateRange.until) {
      body.since = dateRange.since;
      body.until = dateRange.until;
    } else {
      body.date_preset = dateRange.preset;
    }
    const { data, error } = await supabase.functions.invoke('meta-campaign-insights', { body });
    setLoadingInsights(false);
    if (error || data?.error) return;
    // Mapear meta_campaign_id -> internal campaign id
    const mapped: Record<string, CampaignInsights> = {};
    for (const c of campaigns) {
      if (c.meta_campaign_id && data.insights[c.meta_campaign_id]) {
        mapped[c.id] = data.insights[c.meta_campaign_id];
      }
    }
    setInsightsByCamp(mapped);
  };

  useEffect(() => { loadInsights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaigns.length, dateRange.preset, dateRange.since, dateRange.until]);

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
    loadNotes(c.id);
    loadCreatives(c.id);
    loadAdSets(c.id);
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

      {/* Campanhas Tab - List */}
      {tab === 'campanhas' && !selectedCampaign && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
              {['Todas', 'Ativa', 'Pausada', 'Encerrada'].map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
              ))}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <Button
                onClick={async () => {
                  setImportingMeta(true);
                  const { data, error } = await supabase.functions.invoke('meta-import-campaigns', { body: { client_id: id } });
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
                disabled={importingMeta}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {importingMeta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Importar da Meta
              </Button>
              <Button onClick={openNewCampaign} className="neon-glow gap-2" size="sm"><Plus className="w-3 h-3" /> Nova Campanha</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(c => (
              <div key={c.id} onClick={() => openSelectedCampaign(c)} className="glass-surface rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground text-sm">{c.name}</h3>
                    {c.source === 'meta' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium flex items-center gap-1">
                        <Link2 className="w-2.5 h-2.5" /> Meta
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(c.status)}`}>{c.status}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.source !== 'meta' && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => openEditCampaign(c, e)}><Edit2 className="w-3 h-3" /></Button>}
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={(e) => deleteCampaign(c.id, e)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{c.platform} • {c.objective}</p>
                {c.source === 'meta' && (() => {
                  const ins = insightsByCamp[c.id] || {
                    spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, reach: 0,
                    leads: 0, purchases: 0, messages: 0, link_clicks: 0, revenue: 0,
                    cpl: 0, cpp: 0, cpm_msg: 0, roas: 0,
                  };
                  const cells = metricsForObjective(c.objective, ins);
                  const hasData = !!insightsByCamp[c.id];
                  return (
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-border/50 text-xs">
                      {cells.map((m, i) => (
                        <div key={i}>
                          <p className="text-muted-foreground">{m.label}</p>
                          <p className={`font-semibold ${m.highlight ? 'text-primary' : 'text-foreground'} ${!hasData ? 'opacity-50' : ''}`}>{m.value}</p>
                        </div>
                      ))}
                      {!hasData && !loadingInsights && (
                        <p className="col-span-3 text-[10px] text-muted-foreground italic">Sem dados no período</p>
                      )}
                      {loadingInsights && !hasData && (
                        <p className="col-span-3 text-[10px] text-muted-foreground">Carregando...</p>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">{c.start_date || 'Sem data'}</span>
                  {c.budget > 0 && <span className="text-xs font-semibold text-primary">R$ {c.budget.toLocaleString('pt-BR')}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-sm col-span-full text-center py-8">Nenhuma campanha encontrada.</p>}
          </div>
        </div>
      )}

      {/* Campanhas Tab - Detail */}
      {tab === 'campanhas' && selectedCampaign && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
            <Button variant="outline" size="sm" onClick={() => openEditCampaign(selectedCampaign)} className="gap-1"><Edit2 className="w-3 h-3" /> Editar Campanha</Button>
          </div>
          <div className="glass-surface rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-2">{selectedCampaign.name}</h3>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
              <span>{selectedCampaign.platform}</span>
              <span>{selectedCampaign.objective}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(selectedCampaign.status)}`}>{selectedCampaign.status}</span>
            </div>
            {selectedCampaign.budget > 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-muted-foreground">Orçamento</p>
                <p className="text-primary font-bold text-lg">R$ {selectedCampaign.budget.toLocaleString('pt-BR')}</p>
              </div>
            )}
            {selectedCampaign.notes && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Observação / Estratégia</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{selectedCampaign.notes}</p>
              </div>
            )}
          </div>

          {/* Conjuntos de Anúncio (Ad Sets) */}
          {selectedCampaign.source === 'meta' && (
            <div className="glass-surface rounded-xl p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="font-medium text-foreground text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Conjuntos de Anúncio ({adSets.length})
                </h4>
                <Button onClick={importAdSets} size="sm" variant="outline" disabled={importingAdSets} className="gap-1">
                  {importingAdSets ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {adSets.length > 0 ? 'Atualizar' : 'Buscar da Meta'}
                </Button>
              </div>
              {loadingAdSets ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : adSets.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-6">
                  Nenhum conjunto carregado. Clique em "Buscar da Meta" para importar.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {adSets.map(a => {
                    const budget = a.daily_budget > 0 ? `R$ ${Number(a.daily_budget).toLocaleString('pt-BR')}/dia` :
                                   a.lifetime_budget > 0 ? `R$ ${Number(a.lifetime_budget).toLocaleString('pt-BR')} total` : '—';
                    return (
                      <div key={a.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 hover:border-primary/30 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-foreground line-clamp-2 flex-1">{a.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${statusColor(a.status)}`}>{a.status}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <div><span className="text-foreground/60">Orçamento:</span> <span className="text-foreground">{budget}</span></div>
                          <div><span className="text-foreground/60">Otimização:</span> <span className="text-foreground">{a.optimization_goal || '—'}</span></div>
                          <div><span className="text-foreground/60">Lance:</span> <span className="text-foreground">{a.bid_strategy || '—'}</span></div>
                          <div><span className="text-foreground/60">Início:</span> <span className="text-foreground">{a.start_time ? new Date(a.start_time).toLocaleDateString('pt-BR') : '—'}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="glass-surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="font-medium text-foreground text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Criativos</h4>
              <Button onClick={openNewCreative} size="sm" className="neon-glow gap-1"><Plus className="w-3 h-3" /> Novo Criativo</Button>
            </div>

            <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg mb-3 w-fit flex-wrap">
              <button onClick={() => setCreativeFilter('todos')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${creativeFilter === 'todos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                Todos ({creatives.length})
              </button>
              {CREATIVE_STATUS.map(s => {
                const count = creatives.filter(c => c.status === s.value).length;
                return (
                  <button key={s.value} onClick={() => setCreativeFilter(s.value as any)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${creativeFilter === s.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    {s.label} ({count})
                  </button>
                );
              })}
            </div>

            {filteredCreatives.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCreatives.map(cr => {
                  const TypeIco = getCreativeTypeIcon(cr.type);
                  const stBadge = getCreativeStatusBadge(cr.status);
                  const isMeta = cr.source === 'meta';
                  const thumb = cr.thumbnail_url || (cr.link && /\.(jpg|jpeg|png|webp|gif)/i.test(cr.link) ? cr.link : null);
                  return (
                    <div key={cr.id} className="bg-secondary/30 border border-border/50 rounded-lg overflow-hidden group hover:border-primary/30 transition-colors flex flex-col">
                      {thumb ? (
                        <div className="aspect-video bg-secondary/50 relative overflow-hidden">
                          <img src={thumb} alt={cr.name} className="w-full h-full object-cover" loading="lazy" />
                          {isMeta && <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/90 text-white font-semibold">Meta</span>}
                        </div>
                      ) : (
                        <div className="aspect-video bg-secondary/50 flex items-center justify-center">
                          <TypeIco className="w-8 h-8 text-muted-foreground/40" />
                          {isMeta && <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/90 text-white font-semibold">Meta</span>}
                        </div>
                      )}
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground line-clamp-2 flex-1">{cr.title || cr.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${stBadge?.color}`}>{stBadge?.label}</span>
                        </div>
                        {cr.body && <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{cr.body}</p>}
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                          {cr.link ? (
                            <a href={cr.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 truncate">
                              <ExternalLink className="w-3 h-3 shrink-0" /> Ver criativo
                            </a>
                          ) : <span className="text-xs text-muted-foreground capitalize">{cr.type}</span>}
                          {!isMeta && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditCreative(cr)}><Edit2 className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={() => deleteCreative(cr.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs text-center py-6">Nenhum criativo {creativeFilter !== 'todos' ? `em "${getCreativeStatusBadge(creativeFilter)?.label}"` : 'cadastrado'}.</p>
            )}
          </div>

          {/* Anotações */}
          <div className="glass-surface rounded-xl p-5">
            <h4 className="font-medium text-foreground mb-3 text-sm">Anotações</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {notes.map(n => (
                <div key={n.id} className="flex items-start justify-between bg-secondary/30 rounded-lg p-3">
                  <div>
                    <p className="text-sm text-foreground">{n.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <button onClick={() => deleteNote(n.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {notes.length === 0 && <p className="text-muted-foreground text-xs">Nenhuma anotação.</p>}
            </div>
            <div className="flex gap-2">
              <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Escrever anotação..." className="bg-secondary/50 border-border/50" onKeyDown={(e) => e.key === 'Enter' && sendNote()} />
              <Button onClick={sendNote} size="sm" className="neon-glow"><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
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
                    <div key={att.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <CatIcon className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary truncate block">{att.file_name}</a>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {ATTACHMENT_CATEGORIES.find(c => c.value === att.category)?.label || 'Outros'}
                            </span>
                            <span className="text-xs text-muted-foreground">{new Date(att.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeAttachment(att)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><X className="w-4 h-4" /></button>
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
    </div>
  );
}
