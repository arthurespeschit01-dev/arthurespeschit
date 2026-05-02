// =====================================================================
// Serviço compartilhado de métricas Meta — usado tanto pela aba de
// Campanhas (ClientDetail / MetaHierarchyTabs) quanto pelo módulo de
// Relatórios Diários. Garante MESMA FONTE / MESMOS NÚMEROS.
// =====================================================================
import { supabase } from '@/integrations/supabase/client';

export type DatePreset =
  | 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_28d'
  | 'last_30d' | 'this_month' | 'last_month' | 'maximum' | 'custom';

export interface DateRangeValue {
  preset: DatePreset;
  since?: string;  // YYYY-MM-DD
  until?: string;  // YYYY-MM-DD
}

export interface CampaignInsights {
  spend: number; impressions: number; clicks: number;
  ctr: number; cpc: number; cpm: number; reach: number;
  frequency?: number;
  leads: number; purchases: number; messages: number;
  link_clicks: number; revenue: number;
  cpl: number; cpp: number; cpm_msg: number; roas: number;
  engagements?: number;
  video_views?: number;
}

export interface AdSetInsights extends CampaignInsights {}

export function buildPeriodBody(r: DateRangeValue): Record<string, any> {
  const body: any = {};
  if (r.preset === 'custom' && r.since && r.until) {
    body.since = r.since;
    body.until = r.until;
  } else {
    body.date_preset = r.preset;
  }
  return body;
}

/**
 * Busca insights por campanha — mesma chamada usada na aba "Campanhas".
 * Retorna um mapa: meta_campaign_id -> CampaignInsights.
 */
export async function getCampaignInsights(params: {
  client_id: string;
  meta_campaign_ids: string[];
  range: DateRangeValue;
}): Promise<Record<string, CampaignInsights>> {
  if (!params.meta_campaign_ids.length) return {};
  const { data, error } = await supabase.functions.invoke('meta-campaign-insights', {
    body: {
      client_id: params.client_id,
      campaign_ids: params.meta_campaign_ids,
      ...buildPeriodBody(params.range),
    },
  });
  if (error) throw error;
  return ((data as any)?.insights || {}) as Record<string, CampaignInsights>;
}

/**
 * Busca insights por conjunto — mesma chamada usada nas abas de conjuntos.
 * Retorna um mapa: meta_adset_id -> AdSetInsights.
 */
export async function getAdsetInsights(params: {
  client_id: string;
  range: DateRangeValue;
}): Promise<Record<string, AdSetInsights>> {
  const { data, error } = await supabase.functions.invoke('meta-adset-insights', {
    body: { client_id: params.client_id, ...buildPeriodBody(params.range) },
  });
  if (error) throw error;
  return ((data as any)?.insights || {}) as Record<string, AdSetInsights>;
}

// ---------- Formatadores compartilhados (idênticos à aba Campanhas) ----------
export function formatBRL(n: number | undefined | null) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function formatInt(n: number | undefined | null) {
  return Number(n || 0).toLocaleString('pt-BR');
}
export function formatPct(n: number | undefined | null) {
  return `${Number(n || 0).toFixed(2).replace('.', ',')}%`;
}
export function formatDec(n: number | undefined | null, digits = 2) {
  return Number(n || 0).toFixed(digits).replace('.', ',');
}

// ---------- Filtro de status normalizado ----------
export type StatusFilter = 'all' | 'active' | 'paused' | 'archived';
export function matchStatus(status: string | undefined, filter: StatusFilter) {
  const v = (status || '').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'active') return v === 'ativa' || v === 'ativo' || v === 'active';
  if (filter === 'paused') return v === 'pausada' || v === 'pausado' || v === 'paused';
  if (filter === 'archived') {
    return v === 'concluída' || v === 'concluida' || v === 'concluído'
      || v === 'archived' || v === 'finalizada' || v === 'encerrada';
  }
  return true;
}
