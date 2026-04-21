import { useState, useMemo } from 'react';
import { Link2, Copy, Check, RotateCcw, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

type DynParam = { label: string; value: string };
interface Platform {
  id: string;
  label: string;
  defaults: { utm_source: string; utm_medium: string };
  // Params grouped by which UTM field they semantically belong to
  paramsByField: {
    campaign: DynParam[];
    term: DynParam[];
    content: DynParam[];
  };
}

const PLATFORMS: Platform[] = [
  {
    id: 'google_ads',
    label: 'Google Ads',
    defaults: { utm_source: 'google', utm_medium: 'cpc' },
    paramsByField: {
      campaign: [
        { label: '{campaignid}', value: '{campaignid}' },
        { label: '{_campaign}', value: '{_campaign}' },
      ],
      term: [
        { label: '{keyword}', value: '{keyword}' },
        { label: '{matchtype}', value: '{matchtype}' },
        { label: '{adgroupid}', value: '{adgroupid}' },
      ],
      content: [
        { label: '{creative}', value: '{creative}' },
        { label: '{placement}', value: '{placement}' },
        { label: '{network}', value: '{network}' },
        { label: '{device}', value: '{device}' },
      ],
    },
  },
  {
    id: 'meta_ads',
    label: 'Meta Ads (Facebook / Instagram)',
    defaults: { utm_source: 'facebook', utm_medium: 'paid_social' },
    paramsByField: {
      campaign: [
        { label: '{{campaign.name}}', value: '{{campaign.name}}' },
        { label: '{{campaign.id}}', value: '{{campaign.id}}' },
      ],
      term: [
        { label: '{{adset.name}}', value: '{{adset.name}}' },
        { label: '{{adset.id}}', value: '{{adset.id}}' },
        { label: '{{site_source_name}}', value: '{{site_source_name}}' },
        { label: '{{placement}}', value: '{{placement}}' },
      ],
      content: [
        { label: '{{ad.name}}', value: '{{ad.name}}' },
        { label: '{{ad.id}}', value: '{{ad.id}}' },
      ],
    },
  },
  {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    defaults: { utm_source: 'tiktok', utm_medium: 'paid_social' },
    paramsByField: {
      campaign: [
        { label: '__CAMPAIGN_NAME__', value: '__CAMPAIGN_NAME__' },
        { label: '__CAMPAIGN_ID__', value: '__CAMPAIGN_ID__' },
      ],
      term: [
        { label: '__AID_NAME__', value: '__AID_NAME__' },
        { label: '__AID__', value: '__AID__' },
        { label: '__PLACEMENT__', value: '__PLACEMENT__' },
      ],
      content: [
        { label: '__CID_NAME__', value: '__CID_NAME__' },
        { label: '__CID__', value: '__CID__' },
      ],
    },
  },
  {
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    defaults: { utm_source: 'linkedin', utm_medium: 'paid_social' },
    paramsByField: {
      campaign: [{ label: '{campaignId}', value: '{campaignId}' }],
      term: [
        { label: '{placement}', value: '{placement}' },
        { label: '{member}', value: '{member}' },
      ],
      content: [{ label: '{creative}', value: '{creative}' }],
    },
  },
  {
    id: 'youtube_ads',
    label: 'YouTube Ads',
    defaults: { utm_source: 'youtube', utm_medium: 'paid_social' },
    dynamicParams: [],
  },
  {
    id: 'pinterest_ads',
    label: 'Pinterest Ads',
    defaults: { utm_source: 'pinterest', utm_medium: 'paid_social' },
    dynamicParams: [],
  },
  {
    id: 'email_marketing',
    label: 'Email Marketing',
    defaults: { utm_source: 'email', utm_medium: 'email' },
    dynamicParams: [],
  },
  {
    id: 'organic_social',
    label: 'Orgânico / Redes Sociais',
    defaults: { utm_source: 'instagram', utm_medium: 'organic_social' },
    dynamicParams: [],
  },
];

const FIELD_TOOLTIPS: Record<string, string> = {
  utm_source: 'De onde vem o tráfego. Ex: google, facebook, tiktok, newsletter',
  utm_medium: 'O tipo de mídia usada. Ex: cpc, paid_social, email, organic',
  utm_campaign: 'O nome da sua campanha. Ex: black_friday_2024, lancamento_produto',
  utm_term: 'Palavra-chave ou segmentação de público. Ex: tenis_corrida, interesse_moda',
  utm_content: 'Variação do criativo ou anúncio. Ex: video_01, banner_azul, cta_compre_agora',
};

type UtmField = 'campaign' | 'term' | 'content';

function FieldLabel({ label, tooltip, optional }: { label: string; tooltip: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{label}</Label>
      {optional && <span className="text-muted-foreground text-xs">(opcional)</span>}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// Sanitize a UTM value:
// - trim, lowercase non-token text, replace whitespace with underscore
// - PRESERVE dynamic ad-platform macros literally ({{ad.name}}, {keyword}, __CID__, etc.)
//   because Meta/Google/TikTok need them un-encoded to swap at click-time.
const TOKEN_REGEX = /(\{\{[^}]+\}\}|\{[^}]+\}|__[A-Z0-9_]+__)/g;

function sanitize(val: string) {
  if (!val) return '';
  // Split into [text, token, text, token, ...] preserving tokens
  const parts = val.split(TOKEN_REGEX);
  return parts
    .map((part) => {
      if (!part) return '';
      if (TOKEN_REGEX.test(part)) {
        TOKEN_REGEX.lastIndex = 0; // reset stateful regex
        return part; // keep macro literal
      }
      return part.trim().toLowerCase().replace(/\s+/g, '_');
    })
    .join('');
}

// Build query string manually so dynamic macros stay un-encoded.
// Standard chars get URI-encoded; tokens are passed through verbatim.
function encodeUtmValue(val: string) {
  if (!val) return '';
  const parts = val.split(TOKEN_REGEX);
  return parts
    .map((part) => {
      if (!part) return '';
      if (TOKEN_REGEX.test(part)) {
        TOKEN_REGEX.lastIndex = 0;
        return part;
      }
      return encodeURIComponent(part);
    })
    .join('');
}

export default function UTMGenerator() {
  const [mode, setMode] = useState<'platform' | 'custom'>('platform');
  const [platformId, setPlatformId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeInsertField, setActiveInsertField] = useState<UtmField>('campaign');

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
      const raw = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
      const url = new URL(raw);
      // Strip any existing utm_* params so we control them
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) =>
        url.searchParams.delete(k)
      );

      // Preserve any non-utm params already on the URL
      const preserved = url.search ? url.search.replace(/^\?/, '') : '';

      const pairs: string[] = [];
      const push = (k: string, v: string) => {
        const clean = sanitize(v);
        if (clean) pairs.push(`${k}=${encodeUtmValue(clean)}`);
      };
      push('utm_source', utmSource);
      push('utm_medium', utmMedium);
      push('utm_campaign', utmCampaign);
      push('utm_term', utmTerm);
      push('utm_content', utmContent);

      const query = [preserved, pairs.join('&')].filter(Boolean).join('&');
      const base = `${url.origin}${url.pathname}`;
      return query ? `${base}?${query}${url.hash}` : `${base}${url.hash}`;
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

  const insertDynamic = (param: string) => {
    const setter =
      activeInsertField === 'campaign' ? setUtmCampaign :
      activeInsertField === 'term' ? setUtmTerm : setUtmContent;
    setter((v) => (v ? `${v}_${param}` : param));
  };

  const isUrlValid = baseUrl.length === 0 || (() => {
    try {
      new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
      return true;
    } catch { return false; }
  })();

  const utmFields = (
    <>
      <div className="space-y-2">
        <FieldLabel label="URL Base" tooltip="A URL da página de destino, sem parâmetros. Ex: https://seusite.com.br/oferta" />
        <Input
          placeholder="https://seusite.com.br"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className={!isUrlValid ? 'border-destructive' : ''}
        />
        {!isUrlValid && <p className="text-destructive text-xs">URL inválida. Verifique o formato.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel label="utm_source" tooltip={FIELD_TOOLTIPS.utm_source} />
          <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="google, facebook..." />
        </div>
        <div className="space-y-2">
          <FieldLabel label="utm_medium" tooltip={FIELD_TOOLTIPS.utm_medium} />
          <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc, paid_social..." />
        </div>
        <div className="space-y-2">
          <FieldLabel label="utm_campaign" tooltip={FIELD_TOOLTIPS.utm_campaign} />
          <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="nome_campanha" />
        </div>
        <div className="space-y-2">
          <FieldLabel label="utm_term" tooltip={FIELD_TOOLTIPS.utm_term} optional />
          <Input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="palavra-chave" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FieldLabel label="utm_content" tooltip={FIELD_TOOLTIPS.utm_content} optional />
          <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="variação do anúncio" />
        </div>
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="animate-fade-in space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerador de UTMs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie URLs com parâmetros UTM para rastrear suas campanhas de marketing e anúncios
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as 'platform' | 'custom'); handleReset(); }}>
          <TabsList className="w-full max-w-xs">
            <TabsTrigger value="platform" className="flex-1">Por Plataforma</TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">Personalizado</TabsTrigger>
          </TabsList>

          {/* ====== POR PLATAFORMA ====== */}
          <TabsContent value="platform">
            <div className="glass-surface rounded-xl p-6 border border-border/30 space-y-5">
              <div className="space-y-2">
                <FieldLabel label="Plataforma de Anúncio" tooltip="Selecione a plataforma para preencher automaticamente source e medium." />
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

              {utmFields}

              {/* Dynamic params */}
              {platform && platform.dynamicParams.length > 0 && (
                <div className="space-y-3 rounded-lg bg-secondary/50 p-4 border border-border/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">Parâmetros dinâmicos — {platform.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Clique em um parâmetro para inseri-lo no campo selecionado abaixo. A plataforma substituirá automaticamente pelo valor real.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Inserir em:</span>
                    {(['campaign', 'term', 'content'] as const).map((f) => (
                      <Button
                        key={f}
                        type="button"
                        size="sm"
                        variant={activeInsertField === f ? 'default' : 'outline'}
                        className="text-xs h-7 px-3"
                        onClick={() => setActiveInsertField(f)}
                      >
                        utm_{f}
                      </Button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {platform.dynamicParams.map((param) => (
                      <Button
                        key={param.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2 font-mono bg-background/40 hover:bg-primary/20 hover:text-primary hover:border-primary/40 transition-colors"
                        onClick={() => insertDynamic(param.value)}
                      >
                        {param.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ====== PERSONALIZADO ====== */}
          <TabsContent value="custom">
            <div className="glass-surface rounded-xl p-6 border border-border/30 space-y-5">
              {utmFields}
            </div>
          </TabsContent>
        </Tabs>

        {/* Result */}
        {generatedUrl && (
          <div className="glass-surface rounded-xl p-6 border border-primary/20 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <Label className="text-primary font-semibold">URL Gerada</Label>
            </div>
            <div className="bg-background/60 rounded-lg p-4 break-all text-sm text-foreground font-mono border border-border/40 select-all">
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
    </TooltipProvider>
  );
}
