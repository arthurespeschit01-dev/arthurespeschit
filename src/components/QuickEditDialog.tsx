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
import { Loader2, Search, X, Plus, Upload, Copy, Edit2, Image as ImageIcon, Video } from 'lucide-react';
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

  const [budgetDaily, setBudgetDaily] = useState<number | ''>('');

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
        setAdvantageAudience(((t.targeting_automation?.advantage_audience ?? ad.targeting_automation?.advantage_audience) ?? 0) === 1);
        setConfirmAdvantage(false);

        const g: GeoEntry[] = [];
        const gl = t.geo_locations || {};
        (gl.cities || []).forEach((c: any) => g.push({ key: `city:${c.key}`, name: `${c.name}${c.region ? ', ' + c.region : ''}`, type: 'city', country_code: c.country, radius: c.radius }));
        (gl.regions || []).forEach((r: any) => g.push({ key: `region:${r.key}`, name: r.name, type: 'region', country_code: r.country }));
        (gl.countries || []).forEach((c: string) => g.push({ key: `country:${c}`, name: c, type: 'country', country_code: c }));
        (gl.custom_locations || []).forEach((c: any, i: number) => g.push({ key: `custom:${i}`, name: c.name || `${c.latitude},${c.longitude}`, type: 'custom', radius: c.radius }));
        setGeos(g);

        setInterests((t.interests || []).map((i: any) => ({ id: i.id, name: i.name })));

        if (ad.daily_budget) setBudgetDaily(Number(ad.daily_budget) / 100);
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

  function removeGeo(key: string) {
    setGeos(prev => prev.filter(g => g.key !== key));
  }

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

    return targeting;
  }

  async function saveAudience() {
    if (advantageAudience && !confirmAdvantage) {
      toast.error('Confirme a ativação do Advantage Audience');
      return;
    }
    setSavingAdset(true);
    try {
      const targeting = buildTargeting();
      (targeting as any).targeting_automation = { advantage_audience: advantageAudience ? 1 : 0 };
      const payload: any = {
        client_id: clientId,
        meta_adset_id: adset.meta_adset_id,
        targeting,
      };
      if (typeof budgetDaily === 'number' && budgetDaily > 0) payload.daily_budget = budgetDaily;
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
  const [creativeMode, setCreativeMode] = useState<'edit' | 'duplicate' | 'create'>('edit');
  const [savingCreative, setSavingCreative] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function startEdit(cr: CreativeLite, mode: 'edit' | 'duplicate' = 'edit') {
    setEditingCreative(cr);
    setCreativeMode(mode);
    setCreativeMessage(cr.body || '');
    setCreativeHeadline(cr.title || '');
    setCreativeDescription('');
    setCreativeLink('');
    setImageHash(null);
    setVideoId(null);
    setPreviewUrl(cr.thumbnail_url || null);
    // Carrega dados completos
    if (cr.meta_ad_id) {
      supabase.functions.invoke('meta-creative-get', {
        body: { client_id: clientId, meta_ad_id: cr.meta_ad_id },
      }).then(({ data }: any) => {
        const ld = data?.ad?.creative?.object_story_spec?.link_data;
        if (ld) {
          setCreativeMessage(ld.message ?? cr.body ?? '');
          setCreativeHeadline(ld.name ?? cr.title ?? '');
          setCreativeDescription(ld.description ?? '');
          setCreativeLink(ld.link ?? '');
        }
      });
    }
  }

  function startCreate() {
    setEditingCreative({ id: 'new', name: 'Novo anúncio', meta_adset_id: adset.meta_adset_id });
    setCreativeMode('create');
    setCreativeMessage(''); setCreativeHeadline(''); setCreativeDescription('');
    setCreativeLink(''); setImageHash(null); setVideoId(null); setPreviewUrl(null);
  }

  async function handleFileUpload(file: File, kind: 'image' | 'video') {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const { data, error } = await supabase.functions.invoke('meta-upload-media', {
        body: {
          client_id: clientId,
          kind,
          file_base64: b64,
          mime_type: file.type,
          file_name: file.name,
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
        name: editingCreative.name,
      };
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4" /> Editar — {adset.name}
          </DialogTitle>
          <DialogDescription>Ajuste público e criativos sem sair da plataforma.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="audience">Público</TabsTrigger>
            <TabsTrigger value="creatives">Criativos</TabsTrigger>
          </TabsList>

          {/* AUDIENCE */}
          <TabsContent value="audience" className="space-y-4 pt-4">
            {loadingAdset ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
              <>
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

                <Separator />

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

                <div>
                  <Label className="text-xs">Orçamento diário (R$) — opcional</Label>
                  <Input type="number" min={0} step={1} value={budgetDaily}
                    onChange={e => setBudgetDaily(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={onClose}>Cancelar</Button>
                  <Button onClick={saveAudience} disabled={savingAdset}>
                    {savingAdset && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                    Salvar alterações
                  </Button>
                </div>
              </>
            )}
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
                  <Label className="text-xs">Link de destino (URL)</Label>
                  <Input value={creativeLink} onChange={e => setCreativeLink(e.target.value)} placeholder="https://..." />
                </div>

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
