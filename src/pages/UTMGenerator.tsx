import { useState, useMemo } from 'react';
import { Link2, Copy, Check, RotateCcw, Globe, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const PLATFORMS = [
  {
    id: 'google_ads',
    label: 'Google Ads',
    defaults: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'trafego_pesquisa_vendas', utm_content: 'anuncio_responsivo_01', utm_term: 'comprar_tenis_online' },
    dynamicParams: [
      '{campaignid}', '{adgroupid}', '{creative}', '{keyword}', '{matchtype}', '{network}', '{device}', '{placement}'
    ],
  },
  {
    id: 'meta_ads',
    label: 'Meta Ads (Facebook / Instagram)',
    defaults: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'trafego_vendas', utm_content: 'video_01', utm_term: 'interesse_moda' },
    dynamicParams: [
      '{{campaign.id}}', '{{adset.id}}', '{{ad.id}}', '{{campaign.name}}', '{{adset.name}}', '{{ad.name}}', '{{placement}}'
    ],
  },
  {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    defaults: { utm_source: 'tiktok', utm_medium: 'paid_social', utm_campaign: 'trafego_vendas', utm_content: 'video_viral_01', utm_term: 'interesse_streetwear' },
    dynamicParams: [
      '__CAMPAIGN_ID__', '__AID__', '__CID__', '__CAMPAIGN_NAME__', '__AID_NAME__', '__CID_NAME__', '__PLACEMENT__'
    ],
  },
  {
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    defaults: { utm_source: 'linkedin', utm_medium: 'paid_social', utm_campaign: 'lead_b2b', utm_content: 'imagem_01', utm_term: 'gestores_empresas' },
    dynamicParams: [],
  },
  {
    id: 'taboola',
    label: 'Taboola',
    defaults: { utm_source: 'taboola', utm_medium: 'native', utm_campaign: 'conteudo_descoberta', utm_content: 'artigo_01', utm_term: 'interesse_negocios' },
    dynamicParams: ['{campaign_id}', '{campaign_name}', '{site}', '{thumbnail}', '{title}'],
  },
  {
    id: 'custom',
    label: 'Personalizado',
    defaults: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'vendas_tenis_blackfriday', utm_content: 'video_prova_social', utm_term: 'publico_semelhante_1%' },
    dynamicParams: [],
  },
];

export default function UTMGenerator() {
  const [platformId, setPlatformId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [copied, setCopied] = useState(false);

  const platform = PLATFORMS.find((p) => p.id === platformId);

  const handlePlatformChange = (id: string) => {
    setPlatformId(id);
    const p = PLATFORMS.find((pl) => pl.id === id);
    if (p) {
      setUtmSource(p.defaults.utm_source);
      setUtmMedium(p.defaults.utm_medium);
    }
  };

  const generatedUrl = useMemo(() => {
    if (!baseUrl) return '';
    try {
      const url = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
      if (utmSource) url.searchParams.set('utm_source', utmSource);
      if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
      if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
      if (utmTerm) url.searchParams.set('utm_term', utmTerm);
      if (utmContent) url.searchParams.set('utm_content', utmContent);
      return url.toString();
    } catch {
      return '';
    }
  }, [baseUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent]);

  const handleCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setPlatformId('');
    setBaseUrl('');
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
    setUtmTerm('');
    setUtmContent('');
  };

  const insertDynamic = (param: string, field: 'campaign' | 'term' | 'content') => {
    if (field === 'campaign') setUtmCampaign((v) => (v ? `${v}_${param}` : param));
    if (field === 'term') setUtmTerm((v) => (v ? `${v}_${param}` : param));
    if (field === 'content') setUtmContent((v) => (v ? `${v}_${param}` : param));
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gerador de UTMs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Crie URLs com parâmetros UTM para rastrear suas campanhas de anúncios
        </p>
      </div>

      {/* Platform selector */}
      <div className="glass-surface rounded-xl p-6 border border-border/30 space-y-5">
        <div className="space-y-2">
          <Label>Plataforma de Anúncio</Label>
          <Select value={platformId} onValueChange={handlePlatformChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a plataforma" />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>URL Base</Label>
          <Input
            placeholder="https://seusite.com.br/pagina"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>utm_source</Label>
            <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="google, facebook..." />
          </div>
          <div className="space-y-2">
            <Label>utm_medium</Label>
            <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc, paid_social..." />
          </div>
          <div className="space-y-2">
            <Label>utm_campaign</Label>
            <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="nome_campanha" />
          </div>
          <div className="space-y-2">
            <Label>utm_term <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="palavra-chave" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>utm_content <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="variação do anúncio" />
          </div>
        </div>

        {/* Dynamic params */}
        {platform && platform.dynamicParams.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Parâmetros dinâmicos ({platform.label})</Label>
            <p className="text-xs text-muted-foreground">Clique para inserir em campaign, term ou content:</p>
            <div className="flex flex-wrap gap-1.5">
              {platform.dynamicParams.map((param) => (
                <div key={param} className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => insertDynamic(param, 'campaign')}
                    title="Inserir em utm_campaign"
                  >
                    {param}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">Inserir em:</span>
              {(['campaign', 'term', 'content'] as const).map((f) => (
                <button
                  key={f}
                  className="text-[10px] text-primary underline"
                  onClick={() => {
                    if (platform.dynamicParams[0]) insertDynamic(platform.dynamicParams[0], f);
                  }}
                >
                  utm_{f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {generatedUrl && (
        <div className="glass-surface rounded-xl p-6 border border-primary/20 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <Label className="text-primary font-semibold">URL Gerada</Label>
          </div>
          <div className="bg-background/60 rounded-lg p-4 break-all text-sm text-foreground font-mono border border-border/40">
            {generatedUrl}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCopy} className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiada!' : 'Copiar URL'}
            </Button>
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Limpar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
