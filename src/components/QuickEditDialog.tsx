import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Loader2, Search, X, Plus, Copy, Edit2, Image as ImageIcon, Video,
  MessageCircle, Save, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AdSetLite {
  id: string;
  name: string;
  meta_adset_id?: string | null;
  status?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  optimization_goal?: string;
}

interface CreativeLite {
  id: string;
  name: string;
  meta_ad_id?: string | null;
  meta_adset_id?: string | null;
  thumbnail_url?: string | null;
  body?: string | null;
  title?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  adset: AdSetLite;
  creatives: CreativeLite[];
  onChanged: () => void;
}

interface GeoEntry { key: string; name: string; type: string; country_code?: string; region?: string; radius?: number; }
interface InterestEntry { id: string; name: string; audience_size?: number; }

const GENDER_OPTIONS = [
  { value: 0, label: 'Todos' },
  { value: 1, label: 'Homens' },
  { value: 2, label: 'Mulheres' },
];

const OPTIMIZATION_GOALS: { value: string; label: string }[] = [
  { value: 'CONVERSATIONS', label: 'Maximizar nº de conversas' },
  { value: 'OFFSITE_CONVERSIONS', label: 'Conversões' },
  { value: 'LEAD_GENERATION', label: 'Cadastros (leads)' },
  { value: 'LINK_CLICKS', label: 'Cliques no link' },
  { value: 'LANDING_PAGE_VIEWS', label: 'Visualizações da página' },
  { value: 'IMPRESSIONS', label: 'Impressões' },
  { value: 'REACH', label: 'Alcance' },
  { value: 'POST_ENGAGEMENT', label: 'Engajamento' },
  { value: 'VIDEO_VIEWS', label: 'Visualizações de vídeo' },
  { value: 'THRUPLAY', label: 'ThruPlay' },
  { value: 'APP_INSTALLS', label: 'Instalações de app' },
  { value: 'PROFILE_VISIT', label: 'Visitas ao perfil' },
];

const BID_STRATEGIES: { value: string; label: string }[] = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Maior volume (automático)' },
  { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Limite de lance' },
  { value: 'COST_CAP', label: 'Limite de custo' },
];

const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: 'WHATSAPP_MESSAGE', label: 'Enviar mensagem pelo WhatsApp' },
  { value: 'MESSAGE_PAGE', label: 'Enviar mensagem pelo Messenger' },
  { value: 'LEARN_MORE', label: 'Saiba mais' },
  { value: 'SHOP_NOW', label: 'Comprar agora' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'CONTACT_US', label: 'Entrar em contato' },
  { value: 'GET_OFFER', label: 'Obter oferta' },
  { value: 'BOOK_TRAVEL', label: 'Reservar agora' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'GET_QUOTE', label: 'Obter orçamento' },
  { value: 'SUBSCRIBE', label: 'Inscrever-se' },
  { value: 'APPLY_NOW', label: 'Inscrever-se agora' },
  { value: 'ORDER_NOW', label: 'Pedir agora' },
];

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'audience_network', label: 'Audience Network' },
  { id: 'messenger', label: 'Messenger' },
];

const POSITIONS_BY_PLATFORM: Record<string, { value: string; label: string }[]> = {
  facebook: [
    { value: 'feed', label: 'Feed do Facebook' },
    { value: 'profile_feed', label: 'Feed do perfil do Facebook' },
    { value: 'marketplace', label: 'Facebook Marketplace' },
    { value: 'video_feeds', label: 'Feeds de vídeo' },
    { value: 'right_hand_column', label: 'Coluna da direita' },
    { value: 'story', label: 'Stories do Facebook' },
    { value: 'instream_video', label: 'Vídeos in-stream' },
    { value: 'facebook_reels', label: 'Reels do Facebook' },
    { value: 'search', label: 'Resultados de busca' },
  ],
  instagram: [
    { value: 'stream', label: 'Feed do Instagram' },
    { value: 'profile_feed', label: 'Feed do perfil do Instagram' },
    { value: 'explore', label: 'Página inicial do Explorar' },
    { value: 'explore_home', label: 'Explorar' },
    { value: 'story', label: 'Stories do Instagram' },
    { value: 'reels', label: 'Reels do Instagram' },
    { value: 'ig_search', label: 'Busca no Instagram' },
  ],
  audience_network: [
    { value: 'classic', label: 'Native, banner e intersticial' },
    { value: 'rewarded_video', label: 'Vídeos premiados' },
  ],
  messenger: [
    { value: 'messenger_home', label: 'Caixa de entrada do Messenger' },
    { value: 'story', label: 'Stories do Messenger' },
    { value: 'sponsored_messages', label: 'Mensagens patrocinadas' },
  ],
};

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']; // 0..6 Meta usa 0=Mon
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  greeting: string;
  prefilled_message: string;
}

export default function QuickEditDialog({
  open, onClose, clientId, adset, creatives, onChanged,
}: Props) {
  const [tab, setTab] = useState<'audience' | 'creatives'>('audience');

  // ---------- Audience ----------
  const [loadingAdset, setLoadingAdset] = useState(false);
  const [savingAdset, setSavingAdset] = useState(false);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [genders, setGenders] = useState<number>(0);
  const [advantageAudience, setAdvantageAudience] = useState(false);
  const [confirmAdvantage, setConfirmAdvantage] = useState(false);

  // Geo
  const [geos, setGeos] = useState<GeoEntry[]>([]);
  const [geoQuery, setGeoQuery] = useState('');
  const [geoResults, setGeoResults] = useState<any[]>([]);
  const [searchingGeo, setSearchingGeo] = useState(false);
  const [defaultRadius, setDefaultRadius] = useState(20);

  // Interests
  const [interests, setInterests] = useState<InterestEntry[]>([]);
  const [interestQuery, setInterestQuery] = useState('');
  const [interestResults, setInterestResults] = useState<any[]>([]);
  const [searchingInt, setSearchingInt] = useState(false);

  // Budget / schedule
  const [budgetDaily, setBudgetDaily] = useState<number | ''>('');
  const [budgetLifetime, setBudgetLifetime] = useState<number | ''>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  // Placements
  const [advantagePlacements, setAdvantagePlacements] = useState(true);
  const [enabledPlatforms, setEnabledPlatforms] = useState<Record<string, boolean>>({
    facebook: true, instagram: true, audience_network: true, messenger: true,
  });
  const [enabledPositions, setEnabledPositions] = useState<Record<string, string[]>>({
    facebook: [], instagram: [], audience_network: [], messenger: [],
  });

  // Schedule (dayparting)
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  // grid[day][hour] = boolean
  const [scheduleGrid, setScheduleGrid] = useState<boolean[][]>(
    () => Array.from({ length: 7 }, () => Array(24).fill(false))
  );
  const [timezoneType, setTimezoneType] = useState<'USER' | 'ADVERTISER'>('USER');

  // Optimization
  const [optimizationGoal, setOptimizationGoal] = useState<string>('');
  const [bidStrategy, setBidStrategy] = useState<string>('LOWEST_COST_WITHOUT_CAP');
  const [bidAmount, setBidAmount] = useState<number | ''>('');

  useEffect(() => {
    if (!open || !adset.meta_adset_id) return;
    let ignore = false;
    (async () => {
      setLoadingAdset(true);
      try {
        const { data, error } = await supabase.functions.invoke('meta-adset-get', {
          body: { client_id: clientId, meta_adset_id: adset.meta_adset_id },
        });
        if (ignore) return;
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
        const ad = (data as any).adset;
        const t = ad.targeting || {};
        setAgeMin(t.age_min ?? 18);
        setAgeMax(t.age_max ?? 65);
        setGenders((t.genders && t.genders[0]) || 0);
        setAdvantageAudience(((t.targeting_automation?.advantage_audience) ?? 0) === 1);
        setConfirmAdvantage(false);

        const g: GeoEntry[] = [];
        const gl = t.geo_locations || {};
        (gl.cities || []).forEach((c: any) => g.push({ key: `city:${c.key}`, name: `${c.name}${c.region ? ', ' + c.region : ''}`, type: 'city', country_code: c.country, radius: c.radius }));
        (gl.regions || []).forEach((r: any) => g.push({ key: `region:${r.key}`, name: r.name, type: 'region', country_code: r.country }));
        (gl.countries || []).forEach((c: string) => g.push({ key: `country:${c}`, name: c, type: 'country', country_code: c }));
        (gl.custom_locations || []).forEach((c: any, i: number) => g.push({ key: `custom:${i}`, name: c.name || `${c.latitude},${c.longitude}`, type: 'custom', radius: c.radius }));
        setGeos(g);

        setInterests((t.interests || []).map((i: any) => ({ id: i.id, name: i.name })));

        if (ad.daily_budget) setBudgetDaily(Number(ad.daily_budget) / 100); else setBudgetDaily('');
        if (ad.lifetime_budget) setBudgetLifetime(Number(ad.lifetime_budget) / 100); else setBudgetLifetime('');
        setStartTime(ad.start_time ? ad.start_time.slice(0, 16) : '');
        setEndTime(ad.end_time ? ad.end_time.slice(0, 16) : '');

        // Posicionamentos
        const hasPlacementInfo =
          t.publisher_platforms || t.facebook_positions || t.instagram_positions ||
          t.audience_network_positions || t.messenger_positions;
        if (hasPlacementInfo) {
          setAdvantagePlacements(false);
          const plats: Record<string, boolean> = { facebook: false, instagram: false, audience_network: false, messenger: false };
          (t.publisher_platforms || []).forEach((p: string) => { if (p in plats) plats[p] = true; });
          setEnabledPlatforms(plats);
          setEnabledPositions({
            facebook: t.facebook_positions || [],
            instagram: t.instagram_positions || [],
            audience_network: t.audience_network_positions || [],
            messenger: t.messenger_positions || [],
          });
        } else {
          setAdvantagePlacements(true);
        }

        // Programação
        const sched = ad.adset_schedule || [];
        if (Array.isArray(sched) && sched.length > 0) {
          setScheduleEnabled(true);
          const grid = Array.from({ length: 7 }, () => Array(24).fill(false));
          for (const s of sched) {
            const startH = Math.floor((s.start_minute ?? 0) / 60);
            const endH = Math.ceil((s.end_minute ?? 0) / 60);
            (s.days || []).forEach((d: number) => {
              for (let h = startH; h < endH; h++) {
                if (grid[d] && h >= 0 && h < 24) grid[d][h] = true;
              }
            });
          }
          setScheduleGrid(grid);
        } else {
          setScheduleEnabled(false);
          setScheduleGrid(Array.from({ length: 7 }, () => Array(24).fill(false)));
        }

        setOptimizationGoal(ad.optimization_goal || '');
        setBidStrategy(ad.bid_strategy || 'LOWEST_COST_WITHOUT_CAP');
        if (ad.bid_amount) setBidAmount(Number(ad.bid_amount) / 100); else setBidAmount('');
      } catch (e: any) {
        toast.error('Não foi possível carregar o conjunto', { description: e.message });
      } finally {
        setLoadingAdset(false);
      }
    })();
    return () => { ignore = true; };
  }, [open, adset.meta_adset_id, clientId]);

  async function searchGeo() {
    if (!geoQuery.trim()) return;
    setSearchingGeo(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-targeting-search', {
        body: { client_id: clientId, type: 'geo', q: geoQuery },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setGeoResults((data as any).data || []);
    } catch (e: any) {
      toast.error('Falha na busca de local', { description: e.message });
    } finally {
      setSearchingGeo(false);
    }
  }

  async function searchInterests() {
    if (!interestQuery.trim()) return;
    setSearchingInt(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-targeting-search', {
        body: { client_id: clientId, type: 'interests', q: interestQuery },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setInterestResults((data as any).data || []);
    } catch (e: any) {
      toast.error('Falha na busca de interesse', { description: e.message });
    } finally {
      setSearchingInt(false);
    }
  }

  function addGeo(g: any) {
    const key = `${g.type}:${g.key}`;
    if (geos.some(x => x.key === key)) return;
    setGeos(prev => [...prev, {
      key,
      name: `${g.name}${g.region ? ', ' + g.region : ''}${g.country_name ? ' • ' + g.country_name : ''}`,
      type: g.type,
      country_code: g.country_code,
      region: g.region,
      radius: g.type === 'city' ? defaultRadius : undefined,
    }]);
  }

  function removeGeo(key: string) { setGeos(prev => prev.filter(g => g.key !== key)); }
  function setGeoRadius(key: string, radius: number) {
    setGeos(prev => prev.map(g => g.key === key ? { ...g, radius } : g));
  }
  function addInterest(i: any) {
    if (interests.some(x => x.id === i.id)) return;
    setInterests(prev => [...prev, { id: i.id, name: i.name, audience_size: i.audience_size }]);
  }

  function buildTargeting() {
    const cities: any[] = [];
    const regions: any[] = [];
    const countries: string[] = [];
    geos.forEach(g => {
      const realKey = g.key.split(':').slice(1).join(':');
      if (g.type === 'city') cities.push({ key: realKey, radius: g.radius || defaultRadius, distance_unit: 'kilometer' });
      else if (g.type === 'region') regions.push({ key: realKey });
      else if (g.type === 'country') countries.push(realKey);
    });

    const targeting: any = {
      age_min: ageMin,
      age_max: ageMax,
      geo_locations: {},
    };
    if (cities.length) targeting.geo_locations.cities = cities;
    if (regions.length) targeting.geo_locations.regions = regions;
    if (countries.length) targeting.geo_locations.countries = countries;
    if (genders !== 0) targeting.genders = [genders];
    if (interests.length) targeting.interests = interests.map(i => ({ id: i.id, name: i.name }));

    // Placements
    if (!advantagePlacements) {
      const platforms = Object.entries(enabledPlatforms).filter(([, v]) => v).map(([k]) => k);
      if (platforms.length) targeting.publisher_platforms = platforms;
      if (enabledPlatforms.facebook && enabledPositions.facebook.length) targeting.facebook_positions = enabledPositions.facebook;
      if (enabledPlatforms.instagram && enabledPositions.instagram.length) targeting.instagram_positions = enabledPositions.instagram;
      if (enabledPlatforms.audience_network && enabledPositions.audience_network.length) targeting.audience_network_positions = enabledPositions.audience_network;
      if (enabledPlatforms.messenger && enabledPositions.messenger.length) targeting.messenger_positions = enabledPositions.messenger;
    }

    targeting.targeting_automation = { advantage_audience: advantageAudience ? 1 : 0 };
    return targeting;
  }

  function buildAdsetSchedule(): any[] | undefined {
    if (!scheduleEnabled) return undefined;
    // Para cada dia, agrupa horas contíguas em janelas
    const out: any[] = [];
    for (let d = 0; d < 7; d++) {
      const hours = scheduleGrid[d];
      let h = 0;
      while (h < 24) {
        if (hours[h]) {
          let end = h + 1;
          while (end < 24 && hours[end]) end++;
          out.push({
            start_minute: h * 60,
            end_minute: end * 60,
            days: [d],
            timezone_type: timezoneType,
          });
          h = end;
        } else h++;
      }
    }
    return out;
  }

  function toggleCell(d: number, h: number) {
    setScheduleGrid(prev => {
      const next = prev.map(r => [...r]);
      next[d][h] = !next[d][h];
      return next;
    });
  }

  // Drag-to-select
  const [dragState, setDragState] = useState<null | { value: boolean }>(null);
  function onCellMouseDown(d: number, h: number) {
    const value = !scheduleGrid[d][h];
    setDragState({ value });
    setScheduleGrid(prev => {
      const next = prev.map(r => [...r]);
      next[d][h] = value;
      return next;
    });
  }
  function onCellEnter(d: number, h: number) {
    if (!dragState) return;
    setScheduleGrid(prev => {
      const next = prev.map(r => [...r]);
      next[d][h] = dragState.value;
      return next;
    });
  }
  useEffect(() => {
    const up = () => setDragState(null);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  async function saveAudience() {
    if (advantageAudience && !confirmAdvantage) {
      toast.error('Confirme a ativação do Advantage Audience');
      return;
    }
    if (ageMin > ageMax) {
      toast.error('Idade mínima maior que máxima');
      return;
    }
    if (!advantagePlacements) {
      const anyPlatform = Object.values(enabledPlatforms).some(Boolean);
      if (!anyPlatform) {
        toast.error('Selecione ao menos uma plataforma de posicionamento');
        return;
      }
    }
    setSavingAdset(true);
    try {
      const targeting = buildTargeting();
      const payload: any = {
        client_id: clientId,
        meta_adset_id: adset.meta_adset_id,
        targeting,
      };
      if (typeof budgetDaily === 'number' && budgetDaily > 0) payload.daily_budget = budgetDaily;
      if (typeof budgetLifetime === 'number' && budgetLifetime > 0) payload.lifetime_budget = budgetLifetime;
      if (startTime) payload.start_time = new Date(startTime).toISOString();
      if (endTime) payload.end_time = new Date(endTime).toISOString();
      if (optimizationGoal) payload.optimization_goal = optimizationGoal;
      if (bidStrategy) payload.bid_strategy = bidStrategy;
      if (typeof bidAmount === 'number' && bidAmount > 0) payload.bid_amount = bidAmount;
      const sched = buildAdsetSchedule();
      if (sched !== undefined) payload.adset_schedule = sched;

      const { data, error } = await supabase.functions.invoke('meta-adset-update', { body: payload });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success('Conjunto atualizado');
      onChanged();
    } catch (e: any) {
      toast.error('Falha ao atualizar', { description: e.message });
    } finally {
      setSavingAdset(false);
    }
  }

  // ---------- Creatives ----------
  const [editingCreative, setEditingCreative] = useState<CreativeLite | null>(null);
  const [creativeMessage, setCreativeMessage] = useState('');
  const [creativeHeadline, setCreativeHeadline] = useState('');
  const [creativeDescription, setCreativeDescription] = useState('');
  const [creativeLink, setCreativeLink] = useState('');
  const [cta, setCta] = useState<string>('LEARN_MORE');
  const [convoGreeting, setConvoGreeting] = useState('');
  const [convoMessage, setConvoMessage] = useState('');
  const [creativeMode, setCreativeMode] = useState<'edit' | 'duplicate' | 'create'>('edit');
  const [savingCreative, setSavingCreative] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');

  const isMessageCta = cta === 'WHATSAPP_MESSAGE' || cta === 'MESSAGE_PAGE';
  const templateChannel = cta === 'WHATSAPP_MESSAGE' ? 'whatsapp' : cta === 'MESSAGE_PAGE' ? 'messenger' : null;

  async function loadTemplates() {
    if (!templateChannel) { setTemplates([]); return; }
    const { data, error } = await supabase
      .from('message_templates')
      .select('id,name,channel,greeting,prefilled_message')
      .eq('channel', templateChannel)
      .or(`client_id.eq.${clientId},client_id.is.null`)
      .order('name');
    if (error) return;
    setTemplates((data as MessageTemplate[]) || []);
  }
  useEffect(() => { loadTemplates(); /* eslint-disable-next-line */ }, [templateChannel, clientId]);

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) {
      setConvoGreeting(t.greeting);
      setConvoMessage(t.prefilled_message);
      setTemplateName(t.name);
    }
  }

  async function saveTemplate(asNew: boolean) {
    if (!templateChannel) return;
    const name = templateName.trim();
    if (!name) { toast.error('Informe o nome do modelo'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!asNew && selectedTemplateId) {
      const { error } = await supabase.from('message_templates').update({
        name, greeting: convoGreeting, prefilled_message: convoMessage,
      }).eq('id', selectedTemplateId);
      if (error) { toast.error('Falha ao salvar modelo', { description: error.message }); return; }
      toast.success('Modelo atualizado');
    } else {
      const { data, error } = await supabase.from('message_templates').insert({
        user_id: user.id, client_id: clientId, channel: templateChannel,
        name, greeting: convoGreeting, prefilled_message: convoMessage,
      }).select().single();
      if (error) { toast.error('Falha ao criar modelo', { description: error.message }); return; }
      toast.success('Modelo salvo');
      setSelectedTemplateId((data as any).id);
    }
    loadTemplates();
  }

  async function deleteTemplate() {
    if (!selectedTemplateId) return;
    if (!confirm('Excluir este modelo?')) return;
    const { error } = await supabase.from('message_templates').delete().eq('id', selectedTemplateId);
    if (error) { toast.error('Falha', { description: error.message }); return; }
    toast.success('Modelo excluído');
    setSelectedTemplateId('');
    setTemplateName('');
    loadTemplates();
  }

  function startEdit(cr: CreativeLite, mode: 'edit' | 'duplicate' = 'edit') {
    setEditingCreative(cr);
    setCreativeMode(mode);
    setCreativeMessage(cr.body || '');
    setCreativeHeadline(cr.title || '');
    setCreativeDescription('');
    setCreativeLink('');
    setCta('LEARN_MORE');
    setConvoGreeting('');
    setConvoMessage('');
    setSelectedTemplateId('');
    setTemplateName('');
    setImageHash(null);
    setVideoId(null);
    setPreviewUrl(cr.thumbnail_url || null);
    if (cr.meta_ad_id) {
      supabase.functions.invoke('meta-creative-get', {
        body: { client_id: clientId, meta_ad_id: cr.meta_ad_id },
      }).then(({ data }: any) => {
        const creative = data?.ad?.creative;
        const ld = creative?.object_story_spec?.link_data;
        if (ld) {
          setCreativeMessage(ld.message ?? cr.body ?? '');
          setCreativeHeadline(ld.name ?? cr.title ?? '');
          setCreativeDescription(ld.description ?? '');
          setCreativeLink(ld.link ?? '');
          if (ld.call_to_action?.type) setCta(ld.call_to_action.type);
          // tenta extrair greeting/quick reply do whatsapp/messenger
          const cta_value = ld.call_to_action?.value || {};
          if (cta_value.app_destination || cta_value.lead_gen_form_id) { /* noop */ }
        }
      });
    }
  }

  function startCreate() {
    setEditingCreative({ id: 'new', name: 'Novo anúncio', meta_adset_id: adset.meta_adset_id });
    setCreativeMode('create');
    setCreativeMessage(''); setCreativeHeadline(''); setCreativeDescription('');
    setCreativeLink(''); setCta('LEARN_MORE'); setConvoGreeting(''); setConvoMessage('');
    setSelectedTemplateId(''); setTemplateName('');
    setImageHash(null); setVideoId(null); setPreviewUrl(null);
  }

  async function handleFileUpload(file: File, kind: 'image' | 'video') {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const { data, error } = await supabase.functions.invoke('meta-upload-media', {
        body: {
          client_id: clientId, kind, file_base64: b64,
          mime_type: file.type, file_name: file.name,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      if (kind === 'image') {
        setImageHash((data as any).image_hash);
        setVideoId(null);
        setPreviewUrl((data as any).url || URL.createObjectURL(file));
      } else {
        setVideoId((data as any).video_id);
        setImageHash(null);
        setPreviewUrl(URL.createObjectURL(file));
      }
      toast.success('Mídia enviada para a Meta');
    } catch (e: any) {
      toast.error('Falha no upload', { description: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function saveCreative() {
    if (!editingCreative) return;
    if (!isMessageCta && !creativeLink && creativeMode !== 'edit') {
      toast.error('Informe a URL de destino');
      return;
    }
    setSavingCreative(true);
    try {
      const payload: any = {
        client_id: clientId,
        mode: creativeMode,
        meta_ad_id: editingCreative.meta_ad_id,
        meta_adset_id: adset.meta_adset_id,
        message: creativeMessage,
        headline: creativeHeadline,
        description: creativeDescription,
        link: creativeLink || undefined,
        call_to_action_type: cta,
        name: editingCreative.name,
      };
      if (isMessageCta) {
        payload.greeting = convoGreeting;
        payload.prefilled_message = convoMessage;
      }
      if (imageHash) payload.image_hash = imageHash;
      if (videoId) payload.video_id = videoId;
      const { data, error } = await supabase.functions.invoke('meta-creative-update', { body: payload });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(creativeMode === 'edit' ? 'Criativo atualizado' : 'Anúncio criado (pausado)');
      setEditingCreative(null);
      onChanged();
    } catch (e: any) {
      toast.error('Falha ao salvar criativo', { description: e.message });
    } finally {
      setSavingCreative(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> Editar — {adset.name}
          </DialogTitle>
          <DialogDescription>Ajuste público, posicionamentos, programação, otimização e criativos.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="audience">Público</TabsTrigger>
            <TabsTrigger value="creatives">Criativos</TabsTrigger>
          </TabsList>

          {/* AUDIENCE */}
          <TabsContent value="audience" className="pt-4">
            {loadingAdset ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
              <Accordion type="multiple" defaultValue={['demo', 'geo', 'placements']} className="space-y-2">
                {/* Demografia */}
                <AccordionItem value="demo" className="border border-border/40 rounded-md px-3">
                  <AccordionTrigger className="text-sm">Demografia</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Idade mínima</Label>
                        <Input type="number" min={13} max={65} value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Idade máxima</Label>
                        <Input type="number" min={13} max={65} value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Gênero</Label>
                      <div className="flex gap-2 mt-1">
                        {GENDER_OPTIONS.map(g => (
                          <Button key={g.value} type="button" size="sm"
                            variant={genders === g.value ? 'default' : 'outline'}
                            onClick={() => setGenders(g.value)}>
                            {g.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Geo + Interesses */}
                <AccordionItem value="geo" className="border border-border/40 rounded-md px-3">
                  <AccordionTrigger className="text-sm">Localizações e interesses</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div>
                      <Label className="text-xs flex items-center justify-between">
                        <span>Localizações</span>
                        <span className="text-muted-foreground">Raio padrão (cidades):
                          <Input type="number" min={1} max={80} value={defaultRadius}
                            onChange={e => setDefaultRadius(Number(e.target.value))}
                            className="inline-block w-16 h-6 ml-2 text-xs" /> km
                        </span>
                      </Label>
                      <div className="flex gap-2 mt-2">
                        <Input placeholder="Buscar cidade, região ou país..." value={geoQuery}
                          onChange={e => setGeoQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchGeo())} />
                        <Button type="button" size="sm" onClick={searchGeo} disabled={searchingGeo}>
                          {searchingGeo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        </Button>
                      </div>
                      {geoResults.length > 0 && (
                        <div className="mt-2 border border-border/50 rounded-md max-h-40 overflow-y-auto">
                          {geoResults.map((g, i) => (
                            <button key={i} type="button" onClick={() => addGeo(g)}
                              className="w-full text-left px-3 py-1.5 hover:bg-secondary/50 text-xs flex justify-between">
                              <span>{g.name}{g.region ? `, ${g.region}` : ''}</span>
                              <span className="text-muted-foreground">{g.type} • {g.country_name || g.country_code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {geos.map(g => (
                          <div key={g.key} className="flex items-center gap-1 bg-secondary/60 rounded px-2 py-1 text-xs">
                            <span>{g.name}</span>
                            {g.type === 'city' && (
                              <>
                                <Input type="number" min={1} max={80} value={g.radius || 20}
                                  onChange={e => setGeoRadius(g.key, Number(e.target.value))}
                                  className="w-12 h-5 text-xs px-1" />
                                <span>km</span>
                              </>
                            )}
                            <button onClick={() => removeGeo(g.key)}><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                        {geos.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma localização adicionada.</span>}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-xs">Interesses / comportamentos</Label>
                      <div className="flex gap-2 mt-2">
                        <Input placeholder="Buscar interesse..." value={interestQuery}
                          onChange={e => setInterestQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchInterests())} />
                        <Button type="button" size="sm" onClick={searchInterests} disabled={searchingInt}>
                          {searchingInt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                        </Button>
                      </div>
                      {interestResults.length > 0 && (
                        <div className="mt-2 border border-border/50 rounded-md max-h-40 overflow-y-auto">
                          {interestResults.map((i: any) => (
                            <button key={i.id} type="button" onClick={() => addInterest(i)}
                              className="w-full text-left px-3 py-1.5 hover:bg-secondary/50 text-xs flex justify-between">
                              <span>{i.name}</span>
                              {i.audience_size_lower_bound && (
                                <span className="text-muted-foreground">~{Number(i.audience_size_lower_bound).toLocaleString('pt-BR')}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {interests.map(i => (
                          <Badge key={i.id} variant="secondary" className="gap-1">
                            {i.name}
                            <button onClick={() => setInterests(prev => prev.filter(x => x.id !== i.id))}>
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                        {interests.length === 0 && <span className="text-xs text-muted-foreground">Nenhum interesse selecionado.</span>}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2 rounded-md border border-border/50 p-3 bg-secondary/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-medium">Advantage Audience (público automático)</Label>
                          <p className="text-[11px] text-muted-foreground">A Meta pode expandir o público além do que você definiu.</p>
                        </div>
                        <Switch checked={advantageAudience} onCheckedChange={(v) => { setAdvantageAudience(v); setConfirmAdvantage(false); }} />
                      </div>
                      {advantageAudience && (
                        <label className="flex items-center gap-2 text-xs text-amber-400">
                          <Checkbox checked={confirmAdvantage} onCheckedChange={(v) => setConfirmAdvantage(!!v)} />
                          Confirmo que entendo que o público pode ser expandido automaticamente.
                        </label>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Posicionamentos */}
                <AccordionItem value="placements" className="border border-border/40 rounded-md px-3">
                  <AccordionTrigger className="text-sm">Posicionamentos</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <RadioGroup value={advantagePlacements ? 'advantage' : 'manual'} onValueChange={(v) => setAdvantagePlacements(v === 'advantage')}>
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <RadioGroupItem value="advantage" id="adv" />
                        <div>
                          <div className="font-medium">Posicionamentos Advantage+ <span className="text-muted-foreground">(recomendado)</span></div>
                          <div className="text-muted-foreground">Meta otimiza onde o anúncio aparece.</div>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <RadioGroupItem value="manual" id="man" />
                        <div>
                          <div className="font-medium">Posicionamentos manuais</div>
                          <div className="text-muted-foreground">Você escolhe plataformas e posicionamentos.</div>
                        </div>
                      </label>
                    </RadioGroup>

                    {!advantagePlacements && (
                      <div className="space-y-3 mt-3">
                        {PLATFORMS.map(p => (
                          <div key={p.id} className="rounded-md border border-border/40 p-2">
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <Checkbox checked={!!enabledPlatforms[p.id]}
                                onCheckedChange={(v) => setEnabledPlatforms(prev => ({ ...prev, [p.id]: !!v }))} />
                              {p.label}
                            </label>
                            {enabledPlatforms[p.id] && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 pl-6">
                                {(POSITIONS_BY_PLATFORM[p.id] || []).map(pos => {
                                  const checked = enabledPositions[p.id]?.includes(pos.value);
                                  return (
                                    <label key={pos.value} className="flex items-center gap-2 text-[11px]">
                                      <Checkbox checked={checked}
                                        onCheckedChange={(v) => setEnabledPositions(prev => ({
                                          ...prev,
                                          [p.id]: v
                                            ? [...(prev[p.id] || []), pos.value]
                                            : (prev[p.id] || []).filter(x => x !== pos.value),
                                        }))} />
                                      {pos.label}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Programação */}
                <AccordionItem value="schedule" className="border border-border/40 rounded-md px-3">
                  <AccordionTrigger className="text-sm">Programação</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Data/hora de início</Label>
                        <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Data/hora de término (opcional)</Label>
                        <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(!!v)} />
                      Veicular anúncios de acordo com uma programação
                    </label>

                    {scheduleEnabled && (
                      <>
                        <div>
                          <Label className="text-xs">Fuso horário</Label>
                          <Select value={timezoneType} onValueChange={(v) => setTimezoneType(v as any)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USER">Usar o fuso horário do visualizador</SelectItem>
                              <SelectItem value="ADVERTISER">Fuso horário da conta de anúncios</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Clique e arraste para selecionar horários. Azul = anúncio ativo.</p>
                        <div className="overflow-x-auto select-none">
                          <table className="text-[10px] border-collapse">
                            <thead>
                              <tr>
                                <th className="w-10"></th>
                                {HOURS.map(h => (
                                  <th key={h} className="px-1 text-muted-foreground font-normal">{h.toString().padStart(2, '0')}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {DAYS.map((dn, d) => (
                                <tr key={d}>
                                  <td className="pr-2 text-right text-muted-foreground">{dn}</td>
                                  {HOURS.map(h => (
                                    <td key={h} className="p-0">
                                      <div
                                        onMouseDown={() => onCellMouseDown(d, h)}
                                        onMouseEnter={() => onCellEnter(d, h)}
                                        className={`w-5 h-5 border border-border/40 cursor-pointer ${
                                          scheduleGrid[d][h] ? 'bg-primary' : 'bg-secondary/30 hover:bg-secondary/60'
                                        }`}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => setScheduleGrid(Array.from({ length: 7 }, () => Array(24).fill(true)))}>
                            Selecionar tudo
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => setScheduleGrid(Array.from({ length: 7 }, () => Array(24).fill(false)))}>
                            Limpar
                          </Button>
                        </div>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Otimização e orçamento */}
                <AccordionItem value="opt" className="border border-border/40 rounded-md px-3">
                  <AccordionTrigger className="text-sm">Otimização e orçamento</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div>
                      <Label className="text-xs">Meta de desempenho (otimização)</Label>
                      <Select value={optimizationGoal} onValueChange={setOptimizationGoal}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {OPTIMIZATION_GOALS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Estratégia de lance</Label>
                      <Select value={bidStrategy} onValueChange={setBidStrategy}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BID_STRATEGIES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && (
                      <div>
                        <Label className="text-xs">Valor por resultado / lance (R$)</Label>
                        <Input type="number" min={0} step="0.01" value={bidAmount}
                          onChange={e => setBidAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Orçamento diário (R$)</Label>
                        <Input type="number" min={0} step={1} value={budgetDaily}
                          onChange={e => setBudgetDaily(e.target.value === '' ? '' : Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Orçamento vitalício (R$)</Label>
                        <Input type="number" min={0} step={1} value={budgetLifetime}
                          onChange={e => setBudgetLifetime(e.target.value === '' ? '' : Number(e.target.value))} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={saveAudience} disabled={savingAdset || loadingAdset}>
                {savingAdset && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Salvar alterações
              </Button>
            </div>
          </TabsContent>

          {/* CREATIVES */}
          <TabsContent value="creatives" className="space-y-3 pt-4">
            {!editingCreative ? (
              <>
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium">Anúncios deste conjunto</h4>
                  <Button size="sm" onClick={startCreate}>
                    <Plus className="w-3 h-3 mr-1" /> Novo anúncio
                  </Button>
                </div>
                <div className="space-y-2">
                  {creatives.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum anúncio neste conjunto.</p>
                  )}
                  {creatives.map(cr => (
                    <div key={cr.id} className="flex items-center gap-3 p-2 rounded-md border border-border/40 bg-secondary/20">
                      {cr.thumbnail_url ? (
                        <img src={cr.thumbnail_url} alt="" className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{cr.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{cr.title || cr.body || '—'}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => startEdit(cr, 'edit')} disabled={!cr.meta_ad_id}>
                        <Edit2 className="w-3 h-3 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(cr, 'duplicate')} disabled={!cr.meta_ad_id}>
                        <Copy className="w-3 h-3 mr-1" /> Duplicar
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    {creativeMode === 'edit' ? 'Editar criativo' : creativeMode === 'duplicate' ? 'Duplicar com alterações' : 'Novo anúncio'}
                  </h4>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCreative(null)}>← Voltar</Button>
                </div>

                <div>
                  <Label className="text-xs">Texto principal</Label>
                  <Textarea rows={4} value={creativeMessage} onChange={e => setCreativeMessage(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Título</Label>
                    <Input value={creativeHeadline} onChange={e => setCreativeHeadline(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Input value={creativeDescription} onChange={e => setCreativeDescription(e.target.value)} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Chamada para ação (CTA)</Label>
                  <Select value={cta} onValueChange={setCta}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {!isMessageCta && (
                  <div>
                    <Label className="text-xs">URL de destino</Label>
                    <Input value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="https://..." />
                  </div>
                )}

                {isMessageCta && (
                  <div className="rounded-md border border-border/50 p-3 bg-secondary/20 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <MessageCircle className="w-3 h-3" />
                      Configurador de conversa ({cta === 'WHATSAPP_MESSAGE' ? 'WhatsApp' : 'Messenger'})
                    </div>

                    <div>
                      <Label className="text-xs">Modelos salvos</Label>
                      <div className="flex gap-2">
                        <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar modelo..." /></SelectTrigger>
                          <SelectContent>
                            {templates.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nenhum modelo</div>}
                            {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {selectedTemplateId && (
                          <Button type="button" size="sm" variant="outline" onClick={deleteTemplate}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Saudação</Label>
                      <Textarea rows={2} value={convoGreeting} onChange={e => setConvoGreeting(e.target.value)}
                        placeholder="Oi! Como podemos ajudar?" />
                    </div>
                    <div>
                      <Label className="text-xs">Mensagem pronta do usuário</Label>
                      <Textarea rows={2} value={convoMessage} onChange={e => setConvoMessage(e.target.value)}
                        placeholder="Olá! Tenho interesse e queria mais informações, por favor." />
                    </div>

                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Nome do modelo</Label>
                        <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ex: TABELA DE PREÇO" />
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => saveTemplate(false)} disabled={!selectedTemplateId}>
                        <Save className="w-3 h-3 mr-1" /> Editar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => saveTemplate(true)}>
                        <Copy className="w-3 h-3 mr-1" /> Duplicar
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <Label className="text-xs">Trocar mídia (opcional)</Label>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    <Button size="sm" variant="outline" asChild disabled={uploading}>
                      <label>
                        <ImageIcon className="w-3 h-3 mr-1" /> Imagem
                        <input type="file" accept="image/*" hidden
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'image')} />
                      </label>
                    </Button>
                    <Button size="sm" variant="outline" asChild disabled={uploading}>
                      <label>
                        <Video className="w-3 h-3 mr-1" /> Vídeo
                        <input type="file" accept="video/*" hidden
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'video')} />
                      </label>
                    </Button>
                    {uploading && <Loader2 className="w-3 h-3 animate-spin" />}
                    {imageHash && <Badge variant="secondary">Imagem pronta</Badge>}
                    {videoId && <Badge variant="secondary">Vídeo pronto</Badge>}
                  </div>
                  {previewUrl && (
                    <img src={previewUrl} alt="preview" className="mt-2 max-h-40 rounded border border-border/40" />
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingCreative(null)}>Cancelar</Button>
                  <Button onClick={saveCreative} disabled={savingCreative}>
                    {savingCreative && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                    {creativeMode === 'edit' ? 'Salvar criativo' : 'Criar anúncio'}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
