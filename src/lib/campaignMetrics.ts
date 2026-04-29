export interface CampaignInsights {
  spend: number; impressions: number; clicks: number; ctr: number;
  cpc: number; cpm: number; reach: number; leads: number; purchases: number;
  messages: number; link_clicks: number; revenue: number;
  cpl: number; cpp: number; cpm_msg: number; roas: number;
  engagements?: number; frequency?: number; cost_per_engagement?: number;
  followers?: number; profile_visits?: number; cost_per_follower?: number;
}

export interface MetricCell { label: string; value: string; highlight?: boolean }

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const fmtNum = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

type Cell = MetricCell & { _v: number; _alwaysShow?: boolean };
const c = (label: string, value: string, v: number, opts: { highlight?: boolean; alwaysShow?: boolean } = {}): Cell =>
  ({ label, value, _v: v, highlight: opts.highlight, _alwaysShow: opts.alwaysShow });

export function metricsForObjective(objective: string, ins?: CampaignInsights): MetricCell[] {
  if (!ins) return [];
  const obj = (objective || '').toUpperCase();

  const spend = ins.spend || 0;
  const reach = ins.reach || 0;
  const engagements = ins.engagements || 0;
  const messages = ins.messages || 0;
  const leads = ins.leads || 0;
  const purchases = ins.purchases || 0;
  const followers = ins.followers || 0;
  const profileVisits = ins.profile_visits || 0;
  const impressions = ins.impressions || 0;
  const cpe = engagements > 0 ? spend / engagements : 0;
  const cpf = ins.cost_per_follower || (followers > 0 ? spend / followers : 0);
  const frequency = ins.frequency || (reach > 0 ? impressions / reach : 0);

  let cells: Cell[] = [];

  // === Decisão baseada SEMPRE no objetivo da Meta ===

  // Mensagens (WhatsApp/Messenger)
  if (obj.includes('MESSAGES')) {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Alcance', fmtInt(reach), reach),
      c('Mensagens', fmtInt(messages), messages),
      c('Custo/Msg', fmtBRL(ins.cpm_msg || 0), ins.cpm_msg || 0, { highlight: true }),
      c('CPM', fmtBRL(ins.cpm || 0), ins.cpm || 0),
    ];
  }
  // Vendas / Conversões / App
  else if (obj.includes('SALES') || obj.includes('PURCHASE') || obj.includes('CONVERSIONS') || obj.includes('APP_PROMOTION')) {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Alcance', fmtInt(reach), reach),
      c('Conversões', fmtInt(purchases), purchases),
      c('Custo/Conv.', fmtBRL(ins.cpp || 0), ins.cpp || 0),
      c('ROAS', `${fmtNum(ins.roas || 0)}x`, ins.roas || 0, { highlight: true }),
      c('Receita', fmtBRL(ins.revenue || 0), ins.revenue || 0),
    ];
  }
  // Leads
  else if (obj.includes('LEAD')) {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Alcance', fmtInt(reach), reach),
      c('Leads', fmtInt(leads), leads),
      c('CPL', fmtBRL(ins.cpl || 0), ins.cpl || 0, { highlight: true }),
      c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
    ];
  }
  // Tráfego
  else if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICKS')) {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Alcance', fmtInt(reach), reach),
      c('Cliques no link', fmtInt(ins.link_clicks || ins.clicks || 0), ins.link_clicks || ins.clicks || 0),
      c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      c('CPC', fmtBRL(ins.cpc || 0), ins.cpc || 0, { highlight: true }),
    ];
  }
  // Reconhecimento de Marca / Alcance / Engajamento
  // Inclui: OUTCOME_AWARENESS, BRAND_AWARENESS, REACH, OUTCOME_ENGAGEMENT,
  // ENGAGEMENT, POST_ENGAGEMENT, PAGE_LIKES, VIDEO (sem leads/vendas).
  // Painel completo igual ao Gerenciador do Meta para essas campanhas.
  else if (
    obj.includes('AWARENESS') || obj.includes('REACH') ||
    obj.includes('ENGAGEMENT') || obj.includes('PAGE_LIKES') ||
    obj.includes('VIDEO')
  ) {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Seguidores', fmtInt(followers), followers),
      c('Custo/Seguidor', fmtBRL(cpf), cpf, { highlight: true }),
      c('Visitas no perfil', fmtInt(profileVisits), profileVisits),
      c('Engajamentos', fmtInt(engagements), engagements),
      c('Alcance', fmtInt(reach), reach),
      c('Impressões', fmtInt(impressions), impressions),
      c('CPM', fmtBRL(ins.cpm || 0), ins.cpm || 0),
      c('Frequência', fmtNum(frequency), frequency),
      c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
    ];
  }
  // Fallback
  else {
    cells = [
      c('Gasto', fmtBRL(spend), spend, { alwaysShow: true }),
      c('Impressões', fmtInt(impressions), impressions),
      c('CTR', fmtPct(ins.ctr || 0), ins.ctr || 0),
      c('CPC', fmtBRL(ins.cpc || 0), ins.cpc || 0, { highlight: true }),
    ];
  }

  // Filtra zeros, exceto quando alwaysShow=true
  return cells
    .filter((cell) => cell._alwaysShow || cell._v > 0)
    .map(({ _v, _alwaysShow, ...rest }) => rest);
}
