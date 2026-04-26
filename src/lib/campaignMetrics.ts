export interface CampaignInsights {
  spend: number; impressions: number; clicks: number; ctr: number;
  cpc: number; cpm: number; reach: number; leads: number; purchases: number;
  messages: number; link_clicks: number; revenue: number;
  cpl: number; cpp: number; cpm_msg: number; roas: number;
}

export interface MetricCell { label: string; value: string; highlight?: boolean }

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

export function metricsForObjective(objective: string, ins?: CampaignInsights): MetricCell[] {
  if (!ins) return [];
  const obj = (objective || '').toUpperCase();
  const spend: MetricCell = { label: 'Gasto', value: fmtBRL(ins.spend) };

  // Vendas / Compras
  if (obj.includes('SALES') || obj.includes('PURCHASE') || obj.includes('CONVERSIONS')) {
    return [spend,
      { label: 'Compras', value: fmtInt(ins.purchases) },
      { label: 'ROAS', value: `${ins.roas.toFixed(2)}x`, highlight: true },
    ];
  }

  // Leads
  if (obj.includes('LEAD')) {
    return [spend,
      { label: 'Leads', value: fmtInt(ins.leads) },
      { label: 'CPL', value: fmtBRL(ins.cpl), highlight: true },
    ];
  }

  // Mensagens / WhatsApp — OUTCOME_MESSAGES ou nome contém MESSAGES
  if (obj.includes('MESSAGES')) {
    return [spend,
      { label: 'Conversas', value: fmtInt(ins.messages) },
      { label: 'Custo/Conv', value: fmtBRL(ins.cpm_msg), highlight: true },
    ];
  }

  // Tráfego / Cliques
  if (obj.includes('TRAFFIC') || obj.includes('LINK_CLICKS')) {
    return [spend,
      { label: 'Cliques', value: fmtInt(ins.link_clicks || ins.clicks) },
      { label: 'CPC', value: fmtBRL(ins.cpc), highlight: true },
    ];
  }

  // Engajamento — curtidas, comentários, compartilhamentos (NÃO é mensagem)
  if (obj.includes('ENGAGEMENT')) {
    return [spend,
      { label: 'Alcance', value: fmtInt(ins.reach) },
      { label: 'CPM', value: fmtBRL(ins.cpm), highlight: true },
    ];
  }

  // Reconhecimento / Alcance / Vídeo
  if (obj.includes('AWARENESS') || obj.includes('REACH') || obj.includes('VIDEO')) {
    return [spend,
      { label: 'Alcance', value: fmtInt(ins.reach) },
      { label: 'CPM', value: fmtBRL(ins.cpm), highlight: true },
    ];
  }

  // Fallback genérico
  return [spend,
    { label: 'CTR', value: fmtPct(ins.ctr) },
    { label: 'CPC', value: fmtBRL(ins.cpc), highlight: true },
  ];
}
