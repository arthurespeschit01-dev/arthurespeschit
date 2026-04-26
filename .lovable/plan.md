# Diagnóstico

O arquivo `src/pages/ClientDetail.tsx` está com erros de build:

```
src/pages/ClientDetail.tsx(226,29): error TS2304: Cannot find name 'data'.
src/pages/ClientDetail.tsx(227,20): error TS2304: Cannot find name 'data'.
src/pages/ClientDetail.tsx(257,21): error TS2552: Cannot find name 'loadInsights'.
```

**Causa:** Em uma edição anterior, o **corpo** da função `loadInsights` foi colado solto dentro do componente (linhas ~222–255), **sem** o invólucro `const loadInsights = async () => { ... }` e **sem** a chamada `supabase.functions.invoke('meta-campaign-insights', ...)` que produzia o `data`.

Resultado:
- `data.insights[...]` referencia uma variável inexistente.
- `useEffect(() => { loadInsights(); ... })` chama uma função que não existe mais.
- Quando o componente monta, dá erro em runtime → ErrorBoundary mostra **"Algo deu errado"** em todas as abas que usam essa página.

# Correção (sem remover nenhuma função)

Refatorar o trecho entre as linhas ~222 e ~257 de `src/pages/ClientDetail.tsx` para reconstruir a função `loadInsights` corretamente:

```ts
// Buscar insights da Meta para o período selecionado
const loadInsights = async () => {
  if (!id) return;
  const metaCampaigns = campaigns.filter(c => c.source === 'meta' && c.meta_campaign_id);
  if (metaCampaigns.length === 0) {
    // Mesmo sem chamada à API, ainda monta fallback a partir dos dados salvos
    const fallback: Record<string, CampaignInsights> = {};
    for (const c of campaigns) {
      if (c.source === 'meta') {
        const spend = Number(c.spend) || 0;
        const leads = Number((c as any).leads) || 0;
        const purchases = Number((c as any).purchases) || 0;
        const messages = Number((c as any).messages) || 0;
        const revenue = Number((c as any).revenue) || 0;
        fallback[c.id] = {
          spend,
          impressions: Number(c.impressions) || 0,
          clicks: Number(c.clicks) || 0,
          ctr: Number((c as any).ctr) || 0,
          cpc: Number((c as any).cpc) || 0,
          cpm: Number((c as any).cpm) || 0,
          reach: Number((c as any).reach) || 0,
          leads, purchases, messages,
          link_clicks: Number((c as any).link_clicks) || 0,
          revenue,
          cpl: leads > 0 ? spend / leads : 0,
          cpp: purchases > 0 ? spend / purchases : 0,
          cpm_msg: messages > 0 ? spend / messages : 0,
          roas: spend > 0 ? revenue / spend : 0,
        };
      }
    }
    setInsightsByCamp(fallback);
    return;
  }

  setLoadingInsights(true);
  try {
    const { data, error } = await supabase.functions.invoke('meta-campaign-insights', {
      body: {
        client_id: id,
        campaign_ids: metaCampaigns.map(c => c.meta_campaign_id),
        ...buildPeriodBody(),
      },
    });
    if (error) throw error;

    const mapped: Record<string, CampaignInsights> = {};
    for (const c of campaigns) {
      if (c.meta_campaign_id && data?.insights?.[c.meta_campaign_id]) {
        mapped[c.id] = data.insights[c.meta_campaign_id];
      } else if (c.source === 'meta') {
        // Fallback: usa métricas salvas no banco durante o import
        const spend = Number(c.spend) || 0;
        const leads = Number((c as any).leads) || 0;
        const purchases = Number((c as any).purchases) || 0;
        const messages = Number((c as any).messages) || 0;
        const revenue = Number((c as any).revenue) || 0;
        mapped[c.id] = {
          spend,
          impressions: Number(c.impressions) || 0,
          clicks: Number(c.clicks) || 0,
          ctr: Number((c as any).ctr) || 0,
          cpc: Number((c as any).cpc) || 0,
          cpm: Number((c as any).cpm) || 0,
          reach: Number((c as any).reach) || 0,
          leads, purchases, messages,
          link_clicks: Number((c as any).link_clicks) || 0,
          revenue,
          cpl: leads > 0 ? spend / leads : 0,
          cpp: purchases > 0 ? spend / purchases : 0,
          cpm_msg: messages > 0 ? spend / messages : 0,
          roas: spend > 0 ? revenue / spend : 0,
        };
      }
    }
    setInsightsByCamp(mapped);
  } catch (e) {
    console.error('[loadInsights] erro:', e);
  } finally {
    setLoadingInsights(false);
  }
};

useEffect(() => {
  loadInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [campaigns.length, dateRange.preset, dateRange.since, dateRange.until]);
```

# O que isso resolve

- ✅ Remove os 3 erros de TypeScript (`data` inexistente e `loadInsights` inexistente).
- ✅ Volta a tela de detalhes do cliente a renderizar (sem mais "Algo deu errado").
- ✅ Mantém intactas todas as outras funções (Meta Ads, criativos, anexos, campanhas, etc.).
- ✅ Mantém o **fallback** com métricas salvas no banco para quando a edge function não retornar insights.

# Arquivos alterados

- `src/pages/ClientDetail.tsx` — apenas o bloco entre as linhas ~222 e ~257.

Nenhum outro arquivo precisa ser tocado, e nenhuma funcionalidade existente é removida.