// =====================================================================
// Presets de templates de Relatórios Diários por TIPO de campanha.
// Esses presets vivem somente no frontend — NÃO são gravados no banco.
// O usuário escolhe o tipo e a variação no fluxo do gerador, sem precisar
// criar template manualmente. Pode também clicar em "Personalizar este
// template" para abrir o editor com o conteúdo pré-carregado.
// =====================================================================

export type PresetBlockKind = 'header' | 'campaign' | 'adset';
export interface PresetBlock { id: string; kind: PresetBlockKind; text: string }

export type ReportKind =
  | 'messages'
  | 'sales'
  | 'traffic'
  | 'awareness'
  | 'engagement'
  | 'leads'
  | 'video'
  | 'custom';

export type ReportVariant = 'short' | 'detailed' | 'executive';

export interface ReportKindMeta {
  id: ReportKind;
  emoji: string;
  label: string;
  description: string;
}

export const REPORT_KINDS: ReportKindMeta[] = [
  { id: 'messages',   emoji: '💬', label: 'Mensagens',     description: 'Campanhas de conversa no WhatsApp/Messenger.' },
  { id: 'sales',      emoji: '🛒', label: 'Vendas',        description: 'Campanhas de conversão e catálogo.' },
  { id: 'traffic',    emoji: '🖱', label: 'Tráfego',        description: 'Campanhas de cliques no link.' },
  { id: 'awareness',  emoji: '📢', label: 'Alcance',       description: 'Campanhas de awareness e alcance.' },
  { id: 'engagement', emoji: '❤️', label: 'Engajamento',   description: 'Curtidas, comentários e compartilhamentos.' },
  { id: 'leads',      emoji: '📋', label: 'Leads',         description: 'Formulário de cadastro / geração de leads.' },
  { id: 'video',      emoji: '🎥', label: 'Vídeo',         description: 'Campanhas de visualização de vídeo.' },
  { id: 'custom',     emoji: '⚙️', label: 'Personalizado', description: 'Montar do zero com o editor.' },
];

export interface PresetTemplate {
  kind: ReportKind;
  variant: ReportVariant;
  name: string;
  description: string;
  blocks: PresetBlock[];
}

const HEADER_BASIC: PresetBlock = {
  id: 'h1',
  kind: 'header',
  text: '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}',
};

function blocks(headerText: string, campaignText: string, adsetText?: string): PresetBlock[] {
  const out: PresetBlock[] = [
    { id: 'h1', kind: 'header', text: headerText },
    { id: 'c1', kind: 'campaign', text: campaignText },
  ];
  if (adsetText) out.push({ id: 'a1', kind: 'adset', text: adsetText });
  return out;
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  // ========== MENSAGENS ==========
  {
    kind: 'messages', variant: 'short',
    name: 'Mensagens — Resumo Rápido',
    description: 'Principais números das campanhas de conversa.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n💬 Mensagens: {{mensagens}}\n💵 Custo por mensagem: {{custo_por_mensagem}}\n👁 Impressões: {{impressoes}}\n📈 CTR: {{ctr}}\n🔄 Frequência: {{frequencia}}',
    ),
  },
  {
    kind: 'messages', variant: 'detailed',
    name: 'Mensagens — Detalhado',
    description: 'Todas as métricas + conjuntos ativos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n💬 Mensagens: {{mensagens}}\n💵 Custo por mensagem: {{custo_por_mensagem}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n📈 CTR: {{ctr}}\n🔄 Frequência: {{frequencia}}\n👥 Alcance: {{alcance}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 💬 {{mensagens_conjunto}} msgs · 👁 {{impressoes_conjunto}}',
    ),
  },
  {
    kind: 'messages', variant: 'executive',
    name: 'Mensagens — Executivo',
    description: 'Linguagem simples, foco em resultado.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom um investimento de *{{gasto}}*, sua campanha gerou *{{mensagens}} conversas* no período.\nCada conversa custou em média *{{custo_por_mensagem}}*.',
    ),
  },

  // ========== VENDAS ==========
  {
    kind: 'sales', variant: 'short',
    name: 'Vendas — Resumo Rápido',
    description: 'Conversões, CPA e ROAS.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n🛒 Conversões: {{conversoes}}\n💵 CPA: {{cpa}}\n📈 ROAS: {{roas}}\n🖱 Cliques: {{cliques}}\n👁 Impressões: {{impressoes}}',
    ),
  },
  {
    kind: 'sales', variant: 'detailed',
    name: 'Vendas — Detalhado',
    description: 'Tudo de vendas + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n🛒 Conversões: {{conversoes}}\n💵 CPA: {{cpa}}\n📈 ROAS: {{roas}}\n🖱 Cliques: {{cliques}}\n📊 CPC: {{cpc}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n📈 CTR: {{ctr}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 🛒 {{conversoes_conjunto}} · CPA {{cpa_conjunto}}',
    ),
  },
  {
    kind: 'sales', variant: 'executive',
    name: 'Vendas — Executivo',
    description: 'Resultado de vendas em poucas linhas.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nInvestimento de *{{gasto}}* gerou *{{conversoes}} vendas* no período.\nCada venda custou em média *{{cpa}}* com retorno de *{{roas}}x* sobre o investimento.',
    ),
  },

  // ========== TRÁFEGO ==========
  {
    kind: 'traffic', variant: 'short',
    name: 'Tráfego — Resumo Rápido',
    description: 'Cliques no link e CPC.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n🖱 Cliques no link: {{cliques_link}}\n💵 CPC: {{custo_por_clique_link}}\n👁 Impressões: {{impressoes}}\n📈 CTR: {{ctr}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
    ),
  },
  {
    kind: 'traffic', variant: 'detailed',
    name: 'Tráfego — Detalhado',
    description: 'Cliques + alcance + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n🖱 Cliques no link: {{cliques_link}}\n💵 CPC link: {{custo_por_clique_link}}\n📈 CTR: {{ctr}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n👥 Alcance: {{alcance}}\n🔄 Frequência: {{frequencia}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 🖱 {{cliques_conjunto}} · CTR {{ctr_conjunto}}',
    ),
  },
  {
    kind: 'traffic', variant: 'executive',
    name: 'Tráfego — Executivo',
    description: 'Visitas geradas em linguagem simples.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom *{{gasto}}* investidos, sua campanha gerou *{{cliques_link}} visitas* ao site.\nCada visita custou em média *{{custo_por_clique_link}}*.',
    ),
  },

  // ========== ALCANCE ==========
  {
    kind: 'awareness', variant: 'short',
    name: 'Alcance — Resumo Rápido',
    description: 'Pessoas únicas e CPM.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n👥 Alcance: {{alcance}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
    ),
  },
  {
    kind: 'awareness', variant: 'detailed',
    name: 'Alcance — Detalhado',
    description: 'Alcance + frequência + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n👥 Alcance: {{alcance}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 👁 {{impressoes_conjunto}} · 👥 {{alcance_conjunto}}',
    ),
  },
  {
    kind: 'awareness', variant: 'executive',
    name: 'Alcance — Executivo',
    description: 'Pessoas alcançadas em linguagem simples.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom *{{gasto}}* investidos, sua marca alcançou *{{alcance}} pessoas únicas*, com frequência média de *{{frequencia}}x* no período.',
    ),
  },

  // ========== ENGAJAMENTO ==========
  {
    kind: 'engagement', variant: 'short',
    name: 'Engajamento — Resumo Rápido',
    description: 'Cliques, CTR e impressões.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n🖱 Cliques: {{cliques}}\n📈 CTR: {{ctr}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
    ),
  },
  {
    kind: 'engagement', variant: 'detailed',
    name: 'Engajamento — Detalhado',
    description: 'Engajamento + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n🖱 Cliques: {{cliques}}\n📈 CTR: {{ctr}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n👥 Alcance: {{alcance}}\n🔄 Frequência: {{frequencia}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 🖱 {{cliques_conjunto}} · CTR {{ctr_conjunto}}',
    ),
  },
  {
    kind: 'engagement', variant: 'executive',
    name: 'Engajamento — Executivo',
    description: 'Resultado de engajamento simplificado.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom *{{gasto}}* investidos, sua campanha gerou *{{cliques}} interações* e alcançou *{{alcance}} pessoas* no período.',
    ),
  },

  // ========== LEADS ==========
  {
    kind: 'leads', variant: 'short',
    name: 'Leads — Resumo Rápido',
    description: 'Leads, CPL e CTR.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n📋 Leads: {{leads}}\n💵 CPL: {{cpl}}\n🖱 Cliques: {{cliques}}\n📈 CTR: {{ctr}}\n👁 Impressões: {{impressoes}}',
    ),
  },
  {
    kind: 'leads', variant: 'detailed',
    name: 'Leads — Detalhado',
    description: 'Leads + CPL + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n📋 Leads: {{leads}}\n💵 CPL: {{cpl}}\n🖱 Cliques: {{cliques}}\n📈 CTR: {{ctr}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 📋 {{leads_conjunto}} leads · CPL {{cpl_conjunto}}',
    ),
  },
  {
    kind: 'leads', variant: 'executive',
    name: 'Leads — Executivo',
    description: 'Captação de leads em linguagem simples.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom *{{gasto}}* investidos, sua campanha captou *{{leads}} leads* no período.\nCada lead custou em média *{{cpl}}*.',
    ),
  },

  // ========== VÍDEO ==========
  {
    kind: 'video', variant: 'short',
    name: 'Vídeo — Resumo Rápido',
    description: 'Visualizações e CPV.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\n✅ *{{nome_campanha}}*\n💰 Investimento: {{gasto}}\n▶️ Visualizações: {{visualizacoes_video}}\n⏱ ThruPlay: {{reproducoes_thruplay}}\n💵 Custo por visualização: {{custo_por_visualizacao}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n🔄 Frequência: {{frequencia}}',
    ),
  },
  {
    kind: 'video', variant: 'detailed',
    name: 'Vídeo — Detalhado',
    description: 'Vídeo + ThruPlay + conjuntos.',
    blocks: blocks(
      '📊 *Relatório {{tipo_relatorio}} — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}\n💼 Investimento previsto: {{valor_investimento}}\n💳 Saldo da conta: {{saldo_da_conta}}\n———————————',
      '\n✅ *{{nome_campanha}}* ({{status_campanha}})\n💰 Investimento: {{gasto}}\n▶️ Visualizações: {{visualizacoes_video}}\n⏱ ThruPlay: {{reproducoes_thruplay}}\n💵 CPV: {{custo_por_visualizacao}}\n👁 Impressões: {{impressoes}}\n📊 CPM: {{cpm}}\n👥 Alcance: {{alcance}}\n🔄 Frequência: {{frequencia}}',
      '\n📦 *{{nome_conjunto}}*\n💰 {{gasto_conjunto}} · 👁 {{impressoes_conjunto}}',
    ),
  },
  {
    kind: 'video', variant: 'executive',
    name: 'Vídeo — Executivo',
    description: 'Resultado de vídeo simplificado.',
    blocks: blocks(
      HEADER_BASIC.text,
      '\nCom *{{gasto}}* investidos, seu vídeo foi visualizado *{{visualizacoes_video}} vezes*.\nCada visualização custou em média *{{custo_por_visualizacao}}*.',
    ),
  },

  // ========== PERSONALIZADO ==========
  {
    kind: 'custom', variant: 'short',
    name: 'Personalizado — em branco',
    description: 'Comece do zero no editor.',
    blocks: blocks(
      '📊 *Relatório — {{nome_cliente}}*\n📅 {{inicio_do_periodo}} a {{fim_do_periodo}}',
      '\n✅ *{{nome_campanha}}*\n💰 {{gasto}}',
    ),
  },
];

export function getPresetsByKind(kind: ReportKind): PresetTemplate[] {
  return PRESET_TEMPLATES.filter(p => p.kind === kind);
}

export const VARIANT_LABEL: Record<ReportVariant, string> = {
  short: 'Resumo Rápido',
  detailed: 'Detalhado',
  executive: 'Executivo',
};

export const VARIANT_DESC: Record<ReportVariant, string> = {
  short: 'Só os principais números, mensagem curta.',
  detailed: 'Todas as métricas + conjuntos ativos.',
  executive: 'Foco em resultado, sem jargões técnicos.',
};
