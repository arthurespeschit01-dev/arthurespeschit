export interface CampaignInsights {
  spend: number; impressions: number; clicks: number; ctr: number;
  cpc: number; cpm: number; reach: number; leads: number; purchases: number;
  messages: number; link_clicks: number; revenue: number;
  cpl: number; cpp: number; cpm_msg: number; roas: number;
  engagements?: number; frequency?: number; cost_per_engagement?: number;
  followers?: number; profile_visits?: number; cost_per_follower?: number;
  video_views?: number;
}

export interface MetricCell { label: string; value: string; highlight?: boolean }

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const fmtNum = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

type Cell = MetricCell & { _v: number; _alwaysShow?: boolean };
const c = (label: string, value: string, v: number, opts: { highlight?: boolean; alwaysShow?: boolean } = {}): Cell =>
  ({ label, value, _v: v, highlight: opts.highlight, _alwaysShow: opts.alwaysShow });

/**
 * Tipos de painel — derivados ESTRITAMENTE de `objective` + `destination_type`.
 *
 * Regra de ouro:
 *   O objetivo da campanha (objective) é SEMPRE a fonte da verdade.
 *   NÃO existe fallback baseado em valores das actions (ex: "se messages > 0, vira mensagens").
 *   Esse tipo de fallback foi a causa raiz de campanhas de AWARENESS aparecerem como mensagens
 *   só porque tinham reações residuais nas actions.
 *
 * Mapeamento (espelha o Gerenciador da Meta):
 *   OUTCOME_AWARENESS                                  → 'awareness'
 *   OUTCOME_TRAFFIC                                    → 'traffic'
 *   OUTCOME_ENGAGEMENT + dest WHATSAPP/MESSENGER       → 'messages'
 *   OUTCOME_ENGAGEMENT + dest qualquer outro           → 'engagement'
 *   OUTCOME_LEADS  (+ pixel ou form nativo)            → 'leads'
 *   OUTCOME_APP_PROMOTION                              → 'app_promotion'
 *   OUTCOME_SALES                                      → 'sales'
 *   MESSAGES (objetivo legado)                         → 'messages'
 *   Qualquer outro / desconhecido                      → 'fallback' (só mostra reach/impr/cpm/spend)
 */
export type MetricKind =
  | 'awareness'
  | 'traffic'
  | 'messages'
  | 'engagement'
  | 'leads'
  | 'app_promotion'
  | 'sales'
  | 'fallback';

export function detectMetricKind(
  objective: string,
  destinationType?: string,
  optimizationGoal?: string,
): MetricKind {
  const obj = (objective || '').toUpperCase().trim();
  const dest = (destinationType || '').toUpperCase().trim();
  const og = (optimizationGoal || '').toUpperCase().trim();

  // Objetivo legado MESSAGES
  if (obj === 'MESSAGES') return 'messages';

  if (obj === 'OUTCOME_AWARENESS' || obj === 'BRAND_AWARENESS' || obj === 'REACH') {
    return 'awareness';
  }

  if (obj === 'OUTCOME_TRAFFIC' || obj === 'LINK_CLICKS') {
    return 'traffic';
  }

  if (obj === 'OUTCOME_ENGAGEMENT' || obj === 'POST_ENGAGEMENT' || obj === 'PAGE_LIKES' || obj === 'EVENT_RESPONSES' || obj === 'VIDEO_VIEWS') {
    // Conversa quando o destino indica msg/whatsapp/messenger/direct (inclui formatos compostos da Meta
    // como MESSAGING_INSTAGRAM_DIRECT_WHATSAPP, MESSAGING_WHATSAPP, etc.)
    if (
      dest.includes('WHATSAPP') ||
      dest.includes('MESSENGER') ||
      dest.includes('MESSAGING') ||
      dest.includes('INSTAGRAM_DIRECT') ||
      dest.includes('DIRECT')
    ) return 'messages';
    if (og === 'CONVERSATIONS' || og === 'REPLIES' || og === 'LEAD_GENERATION_MESSAGES') return 'messages';
    return 'engagement';
  }

  if (obj === 'OUTCOME_LEADS' || obj === 'LEAD_GENERATION') {
    return 'leads';
  }

  if (obj === 'OUTCOME_APP_PROMOTION' || obj === 'APP_INSTALLS') {
    return 'app_promotion';
  }

  if (obj === 'OUTCOME_SALES' || obj === 'CONVERSIONS' || obj === 'PRODUCT_CATALOG_SALES' || obj === 'STORE_VISITS') {
    return 'sales';
  }

  return 'fallback';
}

export function metricsForObjective(
  objective: string,
  ins?: CampaignInsights,
  optimizationGoal?: string,
  destinationType?: string,
): MetricCell[] {
  if (!ins) return [];

  const spend = ins.spend || 0;
  const reach = ins.reach || 0;
  const impressions = ins.impressions || 0;
  const engagements = ins.engagements || 0;
  const messages = ins.messages || 0;
  const leads = ins.leads || 0;
  const purchases = ins.purchases || 0;
  const followers = ins.followers || 0;
  const profileVisits = ins.profile_visits || 0;
  const videoViews = ins.video_views || 0;
  const cpf = ins.cost_per_follower || (followers > 0 ? spend / followers : 0);
  const frequency = ins.frequency || (reach > 0 ? impressions / reach : 0);

  const kind = detectMetricKind(objective, destinationType, optimizationGoal);

  let cells: Cell[] = [];

  switch (kind) {
    case 'awareness':
      // Reconhecimento: NUNCA mostrar mensagens, leads, compras ou engajamento.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach, { highlight: true }),
        c('Impressões', fmtInt(impressions), impressions),
        c('CPM', fmtBRL(ins.cpm || 0), ins.cpm || 0),
        c('Frequência', fmtNum(frequency), frequency),
      ];
      break;

    case 'traffic':
      // Tráfego: NUNCA mostrar mensagens, compras ou engajamento.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Cliques no link', fmtInt(ins.link_clicks || ins.clicks || 0), ins.link_clicks || ins.clicks || 0, { highlight: true }),
        c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
        c('CPC', fmtBRL(ins.cpc || 0), ins.cpc || 0),
      ];
      break;

    case 'messages':
      // Mensagens (WhatsApp/Messenger/Direct): NUNCA mostrar post_engagement.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Mensagens', fmtInt(messages), messages, { highlight: true }),
        c('Custo/Msg', fmtBRL(ins.cpm_msg || 0), ins.cpm_msg || 0),
        c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      ];
      break;

    case 'engagement':
      // Engajamento puro (post/vídeo/página): mostra post_engagement, nunca mensagens.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Engajamentos', fmtInt(engagements), engagements, { highlight: true }),
        c('Custo/Eng.', fmtBRL(engagements > 0 ? spend / engagements : 0), engagements > 0 ? spend / engagements : 0),
        c('Visualizações de vídeo', fmtInt(videoViews), videoViews),
        c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      ];
      break;

    case 'leads':
      // Leads (formulário nativo OU pixel): tratamos com o mesmo painel, o backend já prioriza o lead correto.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Leads', fmtInt(leads), leads, { highlight: true }),
        c('CPL', fmtBRL(ins.cpl || 0), ins.cpl || 0),
        c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      ];
      break;

    case 'app_promotion':
      // Promoção de App: usamos "purchases" como proxy de instalações/eventos in-app (já agregado pelo backend).
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Instalações/Eventos', fmtInt(purchases), purchases, { highlight: true }),
        c('Custo por evento', fmtBRL(ins.cpp || 0), ins.cpp || 0),
        c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      ];
      break;

    case 'sales':
      // Vendas: NUNCA mostrar mensagens ou engajamento.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Compras', fmtInt(purchases), purchases),
        c('Custo/Compra', fmtBRL(ins.cpp || 0), ins.cpp || 0),
        c('Receita', fmtBRL(ins.revenue || 0), ins.revenue || 0),
        c('ROAS', `${fmtNum(ins.roas || 0)}x`, ins.roas || 0, { highlight: true }),
      ];
      break;

    case 'fallback':
    default:
      // Objetivo desconhecido: NÃO tentar adivinhar. Apenas básico.
      cells = [
        c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
        c('Alcance', fmtInt(reach), reach),
        c('Impressões', fmtInt(impressions), impressions),
        c('CPM', fmtBRL(ins.cpm || 0), ins.cpm || 0),
      ];
      break;
  }

  // Mantém visíveis os "alwaysShow" e a métrica destacada (highlight) mesmo quando 0,
  // para que o usuário entenda que aquela é a métrica principal daquele objetivo.
  return cells
    .filter((cell) => cell._alwaysShow || cell.highlight || cell._v > 0)
    .map(({ _v, _alwaysShow, ...rest }) => rest);
}
