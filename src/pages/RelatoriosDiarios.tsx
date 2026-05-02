import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Edit2, Copy, Trash2, ArrowLeft, Send, ClipboardCopy, RefreshCw,
  GripVertical, ChevronDown, ChevronUp, X, FileText, Sparkles, ArrowRight, Search,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getCampaignInsights, getAdsetInsights, matchStatus as matchStatusShared,
  formatBRL as fmtBRL, formatInt as fmtInt, formatPct as fmtPct, formatDec as fmtDec,
  type DateRangeValue, type DatePreset,
} from '@/services/metaMetrics';

// =====================================================================
// Tipos
// =====================================================================
type BlockKind = 'header' | 'campaign' | 'adset';
interface Block {
  id: string;
  kind: BlockKind;
  text: string;
}
interface Template {
  id: string;
  name: string;
  description: string;
  blocks: Block[];
  created_at?: string;
}

interface ClientRow { id: string; name: string; }
interface CampaignRow {
  id: string;
  name: string;
  client_id: string;
  platform?: string;
  objective?: string;
  status?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  leads?: number;
  purchases?: number;
  messages?: number;
  frequency?: number;
  reach?: number;
  link_clicks?: number;
  video_views?: number;
  meta_campaign_id?: string | null;
}
interface AdSetRow {
  id: string;
  name: string;
  campaign_id: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  leads?: number;
  messages?: number;
  frequency?: number;
  reach?: number;
}

// =====================================================================
// Variáveis disponíveis
// =====================================================================
type VarDef = { key: string; label: string; desc?: string; isNew?: boolean };
const VARIABLES: { group: string; vars: VarDef[] }[] = [
  {
    group: 'Cabeçalho',
    vars: [
      { key: 'nome_cliente', label: 'Nome do cliente', desc: 'Nome do cliente selecionado' },
      { key: 'nome_campanha', label: 'Nome da campanha', desc: 'Nome de cada campanha incluída' },
      { key: 'plataforma', label: 'Plataforma', desc: 'Plataforma da campanha (Meta, Google...)' },
      { key: 'objetivo', label: 'Objetivo', desc: 'Objetivo configurado da campanha' },
      { key: 'status_campanha', label: 'Status da campanha', desc: 'Ativa, pausada ou concluída' },
    ],
  },
  {
    group: 'Datas',
    vars: [
      { key: 'data_hoje', label: 'Data de hoje', desc: 'Data atual no formato dd/mm/aaaa' },
      { key: 'hora_envio', label: 'Hora do envio', desc: 'Hora atual hh:mm' },
      { key: 'data_inicio', label: 'Data de início', desc: 'Início do período do relatório' },
      { key: 'data_fim', label: 'Data de fim', desc: 'Fim do período do relatório' },
      { key: 'tipo_relatorio', label: 'Tipo de relatório', desc: 'Hoje, Ontem, 7 dias...' },
      { key: 'periodo_dias', label: 'Período (dias)', desc: 'Quantidade de dias do período' },
      { key: 'periodo_meses', label: 'Período (meses)', desc: 'Quantidade aproximada de meses' },
      { key: 'inicio_do_periodo', label: 'Início do período', desc: 'Atalho para data de início' },
      { key: 'fim_do_periodo', label: 'Fim do período', desc: 'Atalho para data de fim' },
    ],
  },
  {
    group: 'Financeiro',
    vars: [
      { key: 'valor_investimento', label: 'Investimento previsto', desc: 'Verba mensal contratada' },
      { key: 'saldo_da_conta', label: 'Saldo da conta', desc: 'Saldo atual na conta de anúncios' },
      { key: 'gasto_periodo', label: 'Gasto no período', desc: 'Soma do gasto de todas as campanhas selecionadas' },
      { key: 'gasto', label: 'Gasto da campanha', desc: 'Gasto da campanha individual' },
      { key: 'cpc', label: 'CPC', desc: 'Custo por clique médio' },
      { key: 'cpm', label: 'CPM', desc: 'Custo por mil impressões' },
      { key: 'cpa', label: 'CPA', desc: 'Custo por aquisição/conversão' },
    ],
  },
  {
    group: 'Métricas (campanha)',
    vars: [
      { key: 'impressoes', label: 'Impressões', desc: 'Total de impressões servidas' },
      { key: 'cliques', label: 'Cliques', desc: 'Total de cliques' },
      { key: 'ctr', label: 'CTR', desc: 'Taxa de cliques (%)' },
      { key: 'conversoes', label: 'Conversões', desc: 'Total de conversões (leads + vendas + msgs)' },
      { key: 'freq', label: 'Frequência', desc: 'Frequência média de exibição' },
    ],
  },
  {
    group: 'Métricas (conjunto)',
    vars: [
      { key: 'nome_conjunto', label: 'Nome do conjunto', desc: 'Nome do ad set' },
      { key: 'gasto_conjunto', label: 'Gasto do conjunto', desc: 'Gasto somente do ad set' },
      { key: 'impressoes_conjunto', label: 'Impressões do conjunto' },
      { key: 'cliques_conjunto', label: 'Cliques do conjunto' },
      { key: 'ctr_conjunto', label: 'CTR do conjunto' },
      { key: 'cpa_conjunto', label: 'CPA do conjunto' },
      { key: 'conversoes_conjunto', label: 'Conversões do conjunto' },
    ],
  },
  {
    group: 'Mensagens / WhatsApp',
    vars: [
      { key: 'mensagens', label: 'Mensagens', desc: 'Total de conversas iniciadas', isNew: true },
      { key: 'custo_por_mensagem', label: 'Custo por mensagem', desc: 'Custo médio por mensagem', isNew: true },
      { key: 'mensagens_conjunto', label: 'Mensagens (conjunto)', desc: 'Mensagens por conjunto', isNew: true },
    ],
  },
  {
    group: 'Leads',
    vars: [
      { key: 'leads', label: 'Leads', desc: 'Total de leads gerados', isNew: true },
      { key: 'cpl', label: 'CPL', desc: 'Custo por lead', isNew: true },
      { key: 'leads_conjunto', label: 'Leads (conjunto)', desc: 'Leads por conjunto', isNew: true },
      { key: 'cpl_conjunto', label: 'CPL (conjunto)', desc: 'Custo por lead no conjunto', isNew: true },
    ],
  },
  {
    group: 'Alcance',
    vars: [
      { key: 'alcance', label: 'Alcance', desc: 'Pessoas únicas alcançadas', isNew: true },
      { key: 'alcance_conjunto', label: 'Alcance (conjunto)', desc: 'Alcance por conjunto', isNew: true },
      { key: 'frequencia', label: 'Frequência', desc: 'Frequência média (sinônimo de freq)', isNew: true },
    ],
  },
  {
    group: 'Vídeo',
    vars: [
      { key: 'visualizacoes_video', label: 'Visualizações de vídeo', desc: 'Total de views', isNew: true },
      { key: 'custo_por_visualizacao', label: 'CPV', desc: 'Custo por visualização', isNew: true },
      { key: 'reproducoes_3s', label: 'Reproduções 3s', desc: 'Reproduções de pelo menos 3 segundos', isNew: true },
      { key: 'reproducoes_thruplay', label: 'ThruPlay', desc: 'Vídeo assistido até o fim ou 15s+', isNew: true },
    ],
  },
  {
    group: 'Engajamento',
    vars: [
      { key: 'curtidas', label: 'Curtidas', desc: 'Curtidas no post', isNew: true },
      { key: 'comentarios', label: 'Comentários', desc: 'Total de comentários', isNew: true },
      { key: 'compartilhamentos', label: 'Compartilhamentos', desc: 'Total de compartilhamentos', isNew: true },
      { key: 'cliques_link', label: 'Cliques no link', desc: 'Cliques no link especificamente', isNew: true },
      { key: 'custo_por_clique_link', label: 'CPC de link', desc: 'Custo por clique no link', isNew: true },
    ],
  },
  {
    group: 'Resultados gerais',
    vars: [
      { key: 'resultado', label: 'Resultado', desc: 'Resultado principal (depende do objetivo)', isNew: true },
      { key: 'custo_por_resultado', label: 'Custo por resultado', desc: 'Custo do resultado principal', isNew: true },
      { key: 'roas', label: 'ROAS', desc: 'Retorno sobre investimento (se aplicável)', isNew: true },
    ],
  },
  {
    group: 'Comparativo (período anterior)',
    vars: [
      { key: 'variacao_gasto', label: 'Variação do gasto', desc: 'Ex: +12% vs período anterior', isNew: true },
      { key: 'variacao_resultado', label: 'Variação do resultado', desc: 'Variação do resultado principal', isNew: true },
      { key: 'variacao_cpa', label: 'Variação do CPA', desc: 'Variação do CPA vs período anterior', isNew: true },
    ],
  },
];

// =====================================================================
// Templates iniciais (defaults)
// =====================================================================
const DEFAULT_TEMPLATES: Omit<Template, 'id' | 'created_at'>[] = [
  {
    name: 'Resumo Rápido',
    description: 'Completo com limites — visão objetiva por campanha.',
    blocks: [
      {
        id: 'h1',
        kind: 'header',
        text: '📊 Relatório {{tipo_relatorio}} — {{nome_cliente}}\n📅 {{data_hoje}} — {{hora_envio}}\n\nPeríodo: {{inicio_do_periodo}} a {{fim_do_periodo}}',
      },
      {
        id: 'c1',
        kind: 'campaign',
        text: '✅ {{nome_campanha}}\n💰 {{gasto}} · 👁 {{impressoes}} · 🖱 {{cliques}}\n{{conversoes}} conv. · CPA {{cpa}}',
      },
    ],
  },
  {
    name: 'Detalhado',
    description: 'Todas as métricas, uma por linha — pronto para WhatsApp.',
    blocks: [
      {
        id: 'h1',
        kind: 'header',
        text: '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{data_hoje}} — {{hora_envio}}\n📆 Período: {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      },
      {
        id: 'c1',
        kind: 'campaign',
        text: '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n🎯 {{objetivo}} · {{plataforma}}\n\n💰 Investimento: {{gasto}}\n📊 CPM: {{cpm}}\n🖱 CPC: {{cpc}}\n👁 Impressões: {{impressoes}}\n🔗 Cliques: {{cliques}}\n📈 CTR: {{ctr}}\n🔄 Frequência: {{freq}}\n✉️ Conversões: {{conversoes}}\n💵 CPA: {{cpa}}',
      },
      {
        id: 'a1',
        kind: 'adset',
        text: '\n📦 *{{nome_conjunto}}*\n👁 Impressões: {{impressoes_conjunto}}\n💰 Gasto: {{gasto_conjunto}}\n✉️ Conversões: {{conversoes_conjunto}}\n💵 CPA: {{cpa_conjunto}}\n📈 CTR: {{ctr_conjunto}}',
      },
    ],
  },
  {
    name: 'Executivo',
    description: 'Sem números, foco em resultado.',
    blocks: [
      {
        id: 'h1',
        kind: 'header',
        text: '📊 {{nome_cliente}} — {{tipo_relatorio}}\n📅 {{data_hoje}}\n\nResumo do período {{inicio_do_periodo}} → {{fim_do_periodo}}.',
      },
      {
        id: 'c1',
        kind: 'campaign',
        text: '✅ {{nome_campanha}} — {{conversoes}} conversões geradas.',
      },
    ],
  },
];

// =====================================================================
// Helpers
// =====================================================================
function uid() { return Math.random().toString(36).slice(2, 10); }

function formatBRL(n: number | undefined | null) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatInt(n: number | undefined | null) {
  return Number(n || 0).toLocaleString('pt-BR');
}
function formatPct(n: number | undefined | null) {
  return `${(Number(n || 0)).toFixed(2).replace('.', ',')}%`;
}

function fillVars(text: string, ctx: Record<string, string>) {
  return text.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => (ctx[k] ?? `{{${k}}}`));
}

function getConversoes(c: { leads?: number; purchases?: number; messages?: number }) {
  return Number(c.leads || 0) + Number(c.purchases || 0) + Number(c.messages || 0);
}

// =====================================================================
// Página principal
// =====================================================================
export default function RelatoriosDiarios() {
  const [view, setView] = useState<'list' | 'editor' | 'generator'>('list');
  const [editing, setEditing] = useState<Template | null>(null);
  const [generatingFromId, setGeneratingFromId] = useState<string | null>(null);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Relatórios Diários
          </h1>
          <p className="text-sm text-muted-foreground">
            Gere mensagens prontas com métricas Meta Ads para enviar no WhatsApp.
          </p>
        </div>
        {view === 'list' && (
          <Button onClick={() => { setEditing(null); setView('generator'); }}>
            <Send className="w-4 h-4 mr-2" /> Gerar relatório
          </Button>
        )}
      </div>

      {view === 'list' && (
        <TemplatesList
          onCreate={() => { setEditing(null); setView('editor'); }}
          onEdit={(t) => { setEditing(t); setView('editor'); }}
          onGenerate={(id) => { setGeneratingFromId(id); setView('generator'); }}
        />
      )}
      {view === 'editor' && (
        <TemplateEditor
          initial={editing}
          onCancel={() => setView('list')}
          onSaved={() => setView('list')}
        />
      )}
      {view === 'generator' && (
        <ReportGenerator
          initialTemplateId={generatingFromId}
          onBack={() => { setGeneratingFromId(null); setView('list'); }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Lista de templates
// =====================================================================
function TemplatesList({
  onCreate, onEdit, onGenerate,
}: {
  onCreate: () => void;
  onEdit: (t: Template) => void;
  onGenerate: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('report_templates')
      .select('id,name,description,blocks,created_at')
      .order('created_at', { ascending: true });
    if (error) {
      toast.error('Falha ao carregar templates', { description: error.message });
      setLoading(false);
      return;
    }
    let list = (data || []).map((d: any) => ({ ...d, blocks: d.blocks || [] })) as Template[];
    // Seed defaults na primeira vez
    if (list.length === 0) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const inserts = DEFAULT_TEMPLATES.map(t => ({ ...t, user_id: user.id })) as any;
        const { data: seeded } = await supabase.from('report_templates').insert(inserts).select('id,name,description,blocks,created_at');
        if (seeded) list = seeded.map((d: any) => ({ ...d, blocks: d.blocks || [] })) as Template[];
      }
    }
    setTemplates(list);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function duplicate(t: Template) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('report_templates').insert({
      user_id: user.id,
      name: `${t.name} (cópia)`,
      description: t.description,
      blocks: t.blocks,
    } as any);
    if (error) { toast.error('Falha ao duplicar', { description: error.message }); return; }
    toast.success('Template duplicado');
    load();
  }
  async function remove(t: Template) {
    if (!confirm(`Excluir "${t.name}"?`)) return;
    const { error } = await supabase.from('report_templates').delete().eq('id', t.id);
    if (error) { toast.error('Falha ao excluir', { description: error.message }); return; }
    toast.success('Template excluído');
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo Template
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhum template ainda.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => (
            <Card key={t.id} className="bg-card/60 hover:bg-card transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.name}</CardTitle>
                {t.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {t.blocks.slice(0, 4).map(b => (
                    <Badge key={b.id} variant="secondary" className="text-[10px]">
                      {b.kind === 'header' ? 'Cabeçalho' : b.kind === 'campaign' ? 'Campanha' : 'Conjunto'}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="default" onClick={() => onGenerate(t.id)}>
                    <Send className="w-3 h-3 mr-1" /> Gerar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEdit(t)}>
                    <Edit2 className="w-3 h-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate(t)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(t)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Editor de Template
// =====================================================================
function TemplateEditor({
  initial, onCancel, onSaved,
}: {
  initial: Template | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [blocks, setBlocks] = useState<Block[]>(
    initial?.blocks?.length ? initial.blocks : [
      { id: uid(), kind: 'header', text: '📊 Relatório — {{nome_cliente}}\n📅 {{data_hoje}}' },
    ]
  );
  const [saving, setSaving] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string>(blocks[0]?.id || '');

  function addBlock(kind: BlockKind) {
    const seed = kind === 'header'
      ? '📊 Relatório — {{nome_cliente}}\n📅 {{data_hoje}}'
      : kind === 'campaign'
      ? '✅ {{nome_campanha}}\n💰 {{gasto}} · 👁 {{impressoes}} · 🖱 {{cliques}}'
      : '   • {{nome_conjunto}} — {{gasto_conjunto}} · {{conversoes_conjunto}} conv.';
    const nb: Block = { id: uid(), kind, text: seed };
    setBlocks(prev => [...prev, nb]);
    setActiveBlockId(nb.id);
  }

  function move(idx: number, dir: -1 | 1) {
    setBlocks(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }
  function updateBlock(id: string, text: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text } : b));
  }

  function insertVar(varKey: string) {
    const id = activeBlockId;
    if (!id) return;
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text: b.text + `{{${varKey}}}` } : b));
  }

  async function save() {
    if (!name.trim()) { toast.error('Informe o nome do template'); return; }
    if (blocks.length === 0) { toast.error('Adicione ao menos um bloco'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = { name: name.trim(), description: description.trim(), blocks } as any;
    if (initial?.id) {
      const { error } = await supabase.from('report_templates').update(payload).eq('id', initial.id);
      if (error) { toast.error('Falha ao salvar', { description: error.message }); setSaving(false); return; }
      toast.success('Template atualizado');
    } else {
      const { error } = await supabase.from('report_templates').insert({ ...payload, user_id: user.id } as any);
      if (error) { toast.error('Falha ao salvar', { description: error.message }); setSaving(false); return; }
      toast.success('Template criado');
    }
    setSaving(false);
    onSaved();
  }

  // Preview com dados FAKE para visualização
  const previewText = useMemo(() => buildPreviewText(blocks), [blocks]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar template'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Editor (esquerda) */}
        <div className="lg:col-span-8 space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label className="text-xs">Nome do template <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Resumo Rápido" />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="O que esse template envia..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Blocos do template</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => addBlock('header')}>+ Cabeçalho</Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('campaign')}>+ Campanha</Button>
                <Button size="sm" variant="outline" onClick={() => addBlock('adset')}>+ Conjunto</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {blocks.map((b, i) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  active={activeBlockId === b.id}
                  onActivate={() => setActiveBlockId(b.id)}
                  onChange={(txt) => updateBlock(b.id, txt)}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  onRemove={() => removeBlock(b.id)}
                  canUp={i > 0}
                  canDown={i < blocks.length - 1}
                />
              ))}
              {blocks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Adicione blocos acima.</p>
              )}
            </CardContent>
          </Card>

          <VariablesPanel onInsert={insertVar} />
        </div>

        {/* Preview (direita) */}
        <div className="lg:col-span-4">
          <div className="sticky top-16">
            <Label className="text-xs mb-2 block">Prévia (WhatsApp)</Label>
            <WhatsAppPreview text={previewText} />
          </div>
        </div>
      </div>
    </div>
  );
}

function VariablesPanel({ onInsert }: { onInsert: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(g: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = VARIABLES.map(g => ({
    ...g,
    vars: g.vars.filter(v =>
      !q || v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q) || (v.desc?.toLowerCase().includes(q))
    ),
  })).filter(g => g.vars.length > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Variáveis disponíveis
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">Clique para inserir no bloco selecionado.</p>
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar variável..."
            className="pl-7 h-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
        <TooltipProvider delayDuration={200}>
          {filtered.map(g => {
            const isCollapsed = collapsed.has(g.group) && !q;
            return (
              <div key={g.group} className="border border-border/30 rounded-md">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.group)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary/40"
                >
                  <span>{g.group} <span className="opacity-60">({g.vars.length})</span></span>
                  {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </button>
                {!isCollapsed && (
                  <div className="flex flex-wrap gap-1 p-2 pt-1">
                    {g.vars.map(v => (
                      <Tooltip key={v.key}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onInsert(v.key)}
                            className="text-[11px] px-2 py-1 rounded bg-secondary hover:bg-secondary/80 border border-border/40 inline-flex items-center gap-1"
                          >
                            {`{{${v.key}}}`}
                            {v.isNew && (
                              <span className="text-[9px] px-1 py-0 rounded bg-primary text-primary-foreground font-semibold">novo</span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="text-xs font-medium">{v.label}</div>
                          {v.desc && <div className="text-[11px] opacity-80">{v.desc}</div>}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-3">Nenhuma variável encontrada.</p>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function BlockEditor({
  block, active, onActivate, onChange, onUp, onDown, onRemove, canUp, canDown,
}: {
  block: Block;
  active: boolean;
  onActivate: () => void;
  onChange: (text: string) => void;
  onUp: () => void; onDown: () => void;
  onRemove: () => void;
  canUp: boolean; canDown: boolean;
}) {
  const label = block.kind === 'header' ? 'Cabeçalho (1x)' : block.kind === 'campaign' ? 'Campanha (por campanha)' : 'Conjunto (por conjunto)';
  const color = block.kind === 'header' ? 'bg-primary/15 text-primary' : block.kind === 'campaign' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400';
  return (
    <div
      onClick={onActivate}
      className={`rounded-md border p-2 transition-colors cursor-text ${active ? 'border-primary' : 'border-border/40'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <GripVertical className="w-3 h-3 text-muted-foreground" />
        <Badge className={`${color} border-0 text-[10px]`}>{label}</Badge>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onUp(); }} disabled={!canUp}><ChevronUp className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onDown(); }} disabled={!canDown}><ChevronDown className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X className="w-3 h-3" /></Button>
        </div>
      </div>
      <Textarea
        rows={4}
        value={block.text}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onActivate}
        className="font-mono text-xs"
      />
    </div>
  );
}

// Preview com placeholders fake
function buildPreviewText(blocks: Block[]) {
  const sampleHeaderCtx: Record<string, string> = {
    nome_cliente: 'Cliente Demo',
    tipo_relatorio: 'Diário',
    data_hoje: new Date().toLocaleDateString('pt-BR'),
    hora_envio: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    data_inicio: new Date().toLocaleDateString('pt-BR'),
    data_fim: new Date().toLocaleDateString('pt-BR'),
    inicio_do_periodo: new Date().toLocaleDateString('pt-BR'),
    fim_do_periodo: new Date().toLocaleDateString('pt-BR'),
    periodo_dias: '7',
    periodo_meses: '0',
    valor_investimento: 'R$ 3.000,00',
    saldo_da_conta: 'R$ 1.250,00',
    gasto_periodo: 'R$ 1.750,00',
  };
  const sampleCampaigns = [
    {
      nome_campanha: 'Campanha — Leads Q4',
      plataforma: 'Meta',
      objetivo: 'Geração de leads',
      status_campanha: 'Ativa',
      gasto: 'R$ 980,00', impressoes: '52.341', cliques: '1.204', ctr: '2,30%',
      cpc: 'R$ 0,81', cpm: 'R$ 18,72', cpa: 'R$ 12,40',
      conversoes: '79', freq: '1,32',
    },
    {
      nome_campanha: 'Campanha — Vendas Black',
      plataforma: 'Meta',
      objetivo: 'Conversões',
      status_campanha: 'Ativa',
      gasto: 'R$ 770,00', impressoes: '41.005', cliques: '930', ctr: '2,27%',
      cpc: 'R$ 0,83', cpm: 'R$ 18,78', cpa: 'R$ 22,06',
      conversoes: '35', freq: '1,18',
    },
  ];
  const sampleAdsets = [
    { nome_conjunto: 'Conjunto A — interesses', gasto_conjunto: 'R$ 540,00', impressoes_conjunto: '28.100', cliques_conjunto: '640', ctr_conjunto: '2,28%', cpa_conjunto: 'R$ 11,80', conversoes_conjunto: '46' },
    { nome_conjunto: 'Conjunto B — lookalike', gasto_conjunto: 'R$ 440,00', impressoes_conjunto: '24.241', cliques_conjunto: '564', ctr_conjunto: '2,33%', cpa_conjunto: 'R$ 13,30', conversoes_conjunto: '33' },
  ];

  const headers = blocks.filter(b => b.kind === 'header');
  const campaignTpl = blocks.find(b => b.kind === 'campaign');
  const adsetTpl = blocks.find(b => b.kind === 'adset');

  const out: string[] = [];
  for (const h of headers) out.push(fillVars(h.text, sampleHeaderCtx));

  for (const c of sampleCampaigns) {
    if (campaignTpl) out.push(fillVars(campaignTpl.text, { ...sampleHeaderCtx, ...c }));
    if (adsetTpl) {
      for (const a of sampleAdsets) {
        out.push(fillVars(adsetTpl.text, { ...sampleHeaderCtx, ...c, ...a }));
      }
    }
  }
  return out.join('\n');
}

// =====================================================================
// Preview do WhatsApp
// =====================================================================
function WhatsAppPreview({ text }: { text: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border/40 shadow-lg">
      <div className="bg-[#075E54] text-white px-3 py-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-sm font-bold">R</div>
        <div>
          <div className="text-xs font-medium">Relatórios Diários</div>
          <div className="text-[10px] text-white/70">online</div>
        </div>
      </div>
      <div
        className="p-3 min-h-[300px] max-h-[600px] overflow-y-auto"
        style={{
          backgroundColor: '#0b141a',
          backgroundImage:
            'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.02) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="max-w-[85%] rounded-lg rounded-tl-none bg-[#005c4b] text-white p-2 shadow">
          <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed">
            {text || 'Sua mensagem aparecerá aqui...'}
          </pre>
          <div className="text-[10px] text-white/60 text-right mt-1">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Gerador de Relatório
// =====================================================================
function ReportGenerator({
  initialTemplateId, onBack,
}: {
  initialTemplateId: string | null;
  onBack: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId || '');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7d' | 'month' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [adsets, setAdsets] = useState<AdSetRow[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');
  const [client, setClient] = useState<any>(null);
  const [accountBalance, setAccountBalance] = useState<string>('—');
  const [generated, setGenerated] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncedRange, setSyncedRange] = useState<{ start: string; end: string } | null>(null);

  // Load templates + clients
  useEffect(() => {
    (async () => {
      const [tplRes, cliRes] = await Promise.all([
        supabase.from('report_templates').select('id,name,description,blocks').order('name'),
        supabase.from('clients').select('id,name').eq('status', 'Ativo').order('name'),
      ]);
      const tpls = (tplRes.data || []).map((d: any) => ({ ...d, blocks: d.blocks || [] })) as Template[];
      setTemplates(tpls);
      setClients((cliRes.data || []) as ClientRow[]);
      if (!templateId && tpls[0]) setTemplateId(tpls[0].id);
    })();
  }, []); // eslint-disable-line

  // Load campaigns when client changes
  useEffect(() => {
    if (!clientId) { setCampaigns([]); setAdsets([]); setSelectedCampaignIds(new Set()); return; }
    (async () => {
      const { data: cli } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
      setClient(cli);
      const { data } = await supabase.from('campaigns').select('*').eq('client_id', clientId).order('name');
      const list = (data || []) as CampaignRow[];
      setCampaigns(list);
      setSelectedCampaignIds(new Set(list.map(c => c.id)));
      if (list.length > 0) {
        const { data: ads } = await supabase.from('ad_sets').select('*').in('campaign_id', list.map(c => c.id));
        setAdsets((ads || []) as AdSetRow[]);
      } else {
        setAdsets([]);
      }
    })();
  }, [clientId]);

  function getPeriodLabels() {
    const today = new Date();
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    let start = today, end = today, label = 'Hoje', days = '1';
    if (period === 'today') { start = today; end = today; label = 'Hoje'; days = '1'; }
    else if (period === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); start = end = y; label = 'Ontem'; days = '1'; }
    else if (period === '7d') { const s = new Date(today); s.setDate(s.getDate() - 6); start = s; end = today; label = 'Últimos 7 dias'; days = '7'; }
    else if (period === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = today; label = 'Este mês'; days = String(today.getDate()); }
    else if (period === 'custom') {
      if (customStart) start = new Date(customStart);
      if (customEnd) end = new Date(customEnd);
      const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      label = 'Personalizado';
      days = String(diff);
    }
    return { start: fmt(start), end: fmt(end), label, days };
  }

  // Mapeia o período do gerador para o MESMO DatePreset usado pela aba "Campanhas".
  function getDateRange(): DateRangeValue {
    if (period === 'today') return { preset: 'today' };
    if (period === 'yesterday') return { preset: 'yesterday' };
    if (period === '7d') return { preset: 'last_7d' };
    if (period === 'month') return { preset: 'this_month' };
    return { preset: 'custom', since: customStart, until: customEnd };
  }

  async function generate() {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) { toast.error('Selecione um template'); return; }
    if (!clientId) { toast.error('Selecione um cliente'); return; }
    setGenerating(true);
    try {
      // Saldo da conta (best-effort)
      try {
        const { data } = await supabase.functions.invoke('meta-account-balances', {
          body: { client_id: clientId },
        });
        const bal = (data as any)?.balance ?? (data as any)?.balances?.[0]?.balance;
        if (bal != null) setAccountBalance(formatBRL(Number(bal)));
      } catch { /* ignore */ }

      const range = getDateRange();
      const { start, end, label, days } = getPeriodLabels();

      // ====== MESMA FONTE DA ABA CAMPANHAS ======
      // Busca insights via edge functions, idêntico ao que ClientDetail usa.
      const selectedCampaigns = campaigns.filter(c => selectedCampaignIds.has(c.id));
      const metaCampaigns = selectedCampaigns.filter(c => c.meta_campaign_id);

      let campaignInsights: Record<string, any> = {};
      let adsetInsights: Record<string, any> = {};
      try {
        if (metaCampaigns.length > 0) {
          campaignInsights = await getCampaignInsights({
            client_id: clientId,
            meta_campaign_ids: metaCampaigns.map(c => c.meta_campaign_id!) as string[],
            range,
          });
          adsetInsights = await getAdsetInsights({ client_id: clientId, range });
        }
      } catch (e) {
        console.warn('[relatorios] insights live falhou, usando fallback do banco:', e);
      }
      setLastSyncAt(new Date());
      setSyncedRange({ start, end });

      // Mescla métrica live com a row do banco (live tem prioridade)
      const mergedCampaigns = selectedCampaigns.map(c => {
        const live = c.meta_campaign_id ? campaignInsights[c.meta_campaign_id] : null;
        if (!live) return c;
        return { ...c, ...live };
      });

      const totalSpend = mergedCampaigns.reduce((s, c: any) => s + Number(c.spend || 0), 0);
      const totalImpr = mergedCampaigns.reduce((s, c: any) => s + Number(c.impressions || 0), 0);
      const totalClicks = mergedCampaigns.reduce((s, c: any) => s + Number(c.clicks || 0), 0);
      const totalConv = mergedCampaigns.reduce((s, c: any) => s + getConversoes(c), 0);

      const headerCtx: Record<string, string> = {
        nome_cliente: client?.name || '—',
        tipo_relatorio: label,
        data_hoje: new Date().toLocaleDateString('pt-BR'),
        hora_envio: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data_inicio: start,
        data_fim: end,
        inicio_do_periodo: start,
        fim_do_periodo: end,
        periodo_dias: days,
        periodo_meses: '0',
        valor_investimento: fmtBRL(client?.verba_mensal || 0),
        saldo_da_conta: accountBalance,
        gasto_periodo: fmtBRL(totalSpend),
      };

      const headers = tpl.blocks.filter(b => b.kind === 'header');
      const campaignTpl = tpl.blocks.find(b => b.kind === 'campaign');
      const adsetTpl = tpl.blocks.find(b => b.kind === 'adset');

      const out: string[] = [];
      for (const h of headers) out.push(fillVars(h.text, headerCtx));

      for (const c of mergedCampaigns as any[]) {
        const conv = getConversoes(c);
        const spend = Number(c.spend || 0);
        const leadsN = Number(c.leads || 0);
        const msgsN = Number(c.messages || 0);
        const purchasesN = Number(c.purchases || 0);
        const cpl = leadsN > 0 ? spend / leadsN : 0;
        const cpMsg = msgsN > 0 ? spend / msgsN : 0;
        const videoViews = Number(c.video_views || 0);
        const cpv = videoViews > 0 ? spend / videoViews : 0;
        const linkClicks = Number(c.link_clicks || 0);
        const cpcLink = linkClicks > 0 ? spend / linkClicks : 0;
        const cpaCalc = Number(c.cpa || 0) || (conv > 0 ? spend / conv : 0);
        let resultado = conv;
        if (purchasesN > 0) resultado = purchasesN;
        else if (leadsN > 0) resultado = leadsN;
        else if (msgsN > 0) resultado = msgsN;
        const cpResult = resultado > 0 ? spend / resultado : 0;

        const cCtx: Record<string, string> = {
          ...headerCtx,
          nome_campanha: c.name,
          plataforma: c.platform || 'Meta Ads',
          objetivo: c.objective || '—',
          status_campanha: c.status || '—',
          gasto: fmtBRL(spend),
          impressoes: fmtInt(c.impressions),
          cliques: fmtInt(c.clicks),
          ctr: fmtPct(c.ctr),
          cpc: fmtBRL(c.cpc),
          cpm: fmtBRL(c.cpm),
          cpa: fmtBRL(cpaCalc),
          conversoes: String(conv),
          freq: fmtDec(c.frequency),
          mensagens: fmtInt(msgsN),
          custo_por_mensagem: fmtBRL(cpMsg),
          leads: fmtInt(leadsN),
          cpl: fmtBRL(cpl),
          alcance: fmtInt(c.reach),
          frequencia: fmtDec(c.frequency),
          visualizacoes_video: fmtInt(videoViews),
          custo_por_visualizacao: fmtBRL(cpv),
          reproducoes_3s: fmtInt(videoViews),
          reproducoes_thruplay: '—',
          curtidas: '—',
          comentarios: '—',
          compartilhamentos: '—',
          cliques_link: fmtInt(linkClicks),
          custo_por_clique_link: fmtBRL(cpcLink),
          resultado: String(resultado),
          custo_por_resultado: fmtBRL(cpResult),
          roas: fmtDec(c.roas),
          variacao_gasto: '—',
          variacao_resultado: '—',
          variacao_cpa: '—',
        };
        if (campaignTpl) out.push(fillVars(campaignTpl.text, cCtx));

        if (adsetTpl) {
          const adsetsForCampaign = adsets.filter(a => a.campaign_id === c.id);
          for (const a of adsetsForCampaign as any[]) {
            const live = a.meta_adset_id ? adsetInsights[a.meta_adset_id] : null;
            const merged = live ? { ...a, ...live } : a;
            const aConv = getConversoes(merged);
            const aSpend = Number(merged.spend || 0);
            const aLeads = Number(merged.leads || 0);
            const aMsgs = Number(merged.messages || 0);
            const aCpl = aLeads > 0 ? aSpend / aLeads : 0;
            const aCpa = Number(merged.cpa || 0) || (aConv > 0 ? aSpend / aConv : 0);
            const aCtx: Record<string, string> = {
              ...cCtx,
              nome_conjunto: merged.name,
              gasto_conjunto: fmtBRL(aSpend),
              impressoes_conjunto: fmtInt(merged.impressions),
              cliques_conjunto: fmtInt(merged.clicks),
              ctr_conjunto: fmtPct(merged.ctr),
              cpa_conjunto: fmtBRL(aCpa),
              conversoes_conjunto: String(aConv),
              mensagens_conjunto: fmtInt(aMsgs),
              leads_conjunto: fmtInt(aLeads),
              cpl_conjunto: fmtBRL(aCpl),
              alcance_conjunto: fmtInt(merged.reach),
            };
            out.push(fillVars(adsetTpl.text, aCtx));
          }
        }
      }

      // Totais gerais (rodapé)
      if (mergedCampaigns.length > 1) {
        out.push('\n———————————');
        out.push(`📊 *Totais do período*`);
        out.push(`💰 Investimento total: ${fmtBRL(totalSpend)}`);
        out.push(`👁 Impressões: ${fmtInt(totalImpr)}`);
        out.push(`🔗 Cliques: ${fmtInt(totalClicks)}`);
        out.push(`✉️ Conversões: ${fmtInt(totalConv)}`);
      }

      setGenerated(out.join('\n'));
    } finally {
      setGenerating(false);
    }
  }


  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(generated);
      toast.success('Mensagem copiada! Cole diretamente no WhatsApp.');
    } catch {
      toast.error('Não foi possível copiar');
    }
  }

  function toggleCampaign(id: string) {
    setSelectedCampaignIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Configurações */}
        <div className="lg:col-span-7 space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Configurações</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Período</Label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {[
                    { v: 'today', l: 'Hoje' },
                    { v: 'yesterday', l: 'Ontem' },
                    { v: '7d', l: 'Últimos 7 dias' },
                    { v: 'month', l: 'Este mês' },
                    { v: 'custom', l: 'Personalizado' },
                  ].map(p => (
                    <Button
                      key={p.v}
                      type="button"
                      size="sm"
                      variant={period === p.v ? 'default' : 'outline'}
                      onClick={() => setPeriod(p.v as any)}
                    >
                      {p.l}
                    </Button>
                  ))}
                </div>
                {period === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                    <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Campanhas a incluir</Label>
                </div>

                {/* Filtros de status */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {([
                    { v: 'all', l: 'Todas' },
                    { v: 'active', l: 'Ativas' },
                    { v: 'paused', l: 'Pausadas' },
                    { v: 'archived', l: 'Concluídas' },
                  ] as const).map(f => (
                    <Button
                      key={f.v}
                      type="button"
                      size="sm"
                      variant={campaignStatusFilter === f.v ? 'default' : 'outline'}
                      className="h-7 text-[11px]"
                      onClick={() => setCampaignStatusFilter(f.v)}
                    >
                      {f.l}
                    </Button>
                  ))}
                </div>

                {/* Busca */}
                <div className="relative mt-2">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={campaignSearch}
                    onChange={e => setCampaignSearch(e.target.value)}
                    placeholder="Buscar campanha pelo nome..."
                    className="pl-7 h-8 text-xs"
                  />
                </div>

                {(() => {
                  const q = campaignSearch.trim().toLowerCase();
                  const matchStatus = (s?: string) =>
                    matchStatusShared(s, campaignStatusFilter as any);
                  const visible = campaigns.filter(c =>
                    matchStatus(c.status) && (!q || c.name.toLowerCase().includes(q))
                  );
                  const dotColor = (s?: string) => {
                    const v = (s || '').toLowerCase();
                    if (v === 'ativa' || v === 'ativo' || v === 'active') return 'bg-emerald-500';
                    if (v === 'pausada' || v === 'pausado' || v === 'paused') return 'bg-amber-500';
                    return 'bg-muted-foreground/50';
                  };

                  return (
                    <>
                      {visible.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                            onClick={() => setSelectedCampaignIds(prev => {
                              const next = new Set(prev);
                              visible.forEach(c => next.add(c.id));
                              return next;
                            })}>
                            Selecionar todas
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                            onClick={() => setSelectedCampaignIds(prev => {
                              const next = new Set(prev);
                              visible.forEach(c => next.delete(c.id));
                              return next;
                            })}>
                            Nenhuma
                          </Button>
                        </div>
                      )}
                      <div className="border border-border/40 rounded-md p-2 max-h-56 overflow-y-auto space-y-1 mt-1">
                        {!clientId && <p className="text-[11px] text-muted-foreground">Selecione um cliente.</p>}
                        {clientId && campaigns.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma campanha encontrada.</p>}
                        {clientId && campaigns.length > 0 && visible.length === 0 && (
                          <p className="text-[11px] text-muted-foreground">Nenhuma campanha bate com o filtro.</p>
                        )}
                        {visible.map(c => (
                          <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={selectedCampaignIds.has(c.id)}
                              onCheckedChange={() => toggleCampaign(c.id)}
                            />
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor(c.status)}`} title={c.status || ''} />
                            <span className="flex-1 truncate">{c.name}</span>
                            <span className="text-muted-foreground text-[10px]">{formatBRL(c.spend)}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              <Button onClick={generate} disabled={generating || !templateId || !clientId} className="w-full">
                {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                Gerar relatório
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Resultado */}
        <div className="lg:col-span-5">
          <Card className="sticky top-16">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Mensagem final</CardTitle>
              {generated && (
                <Button size="sm" variant="ghost" onClick={generate}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Regenerar
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {generated ? (
                <>
                  <WhatsAppPreview text={generated} />
                  <Button onClick={copyToClipboard} className="w-full" size="lg">
                    <ClipboardCopy className="w-4 h-4 mr-2" /> Copiar Mensagem
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Mensagem copiada? Cole diretamente no WhatsApp.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Configure e clique em "Gerar relatório" para visualizar.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
