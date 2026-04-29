## Goal

Replace the current fixed metric set (Gasto / Alcance / CPM) with **dynamic metrics tailored to each campaign's `objective`** returned by the Meta API. Apply the same logic to campaign cards, Ad Set cards and Creative cards.

## Mapping by objective

| Objective (Meta) | Métricas exibidas |
|---|---|
| `OUTCOME_TRAFFIC` / `LINK_CLICKS` | Gasto, Alcance, Cliques no link, CTR, CPC |
| `OUTCOME_ENGAGEMENT` / `POST_ENGAGEMENT` | Gasto, Alcance, Engajamentos, Custo por Engajamento, CPM |
| `OUTCOME_LEADS` / `LEAD_GENERATION` | Gasto, Alcance, Leads, Custo por Lead, CTR |
| `OUTCOME_SALES` / `OUTCOME_APP_PROMOTION` / `CONVERSIONS` | Gasto, Alcance, Conversões, Custo por Conversão, ROAS, Valor convertido |
| `OUTCOME_AWARENESS` / `BRAND_AWARENESS` / `REACH` | Gasto, Alcance, Impressões, CPM, Frequência |
| `MESSAGES` / `OUTCOME_MESSAGES` | Gasto, Alcance, Mensagens iniciadas, Custo por Mensagem, CPM |
| Fallback | Gasto, Impressões, CTR, CPC |

Regras de exibição:
- Valores monetários em `R$ 0,00` (pt-BR).
- Métricas indisponíveis (zero ou ausentes) são **omitidas** — não renderizar `—` nem placeholder.
- `highlight: true` no KPI principal de cada objetivo (CPL, CPC, ROAS, Custo/Conv, etc.).

## Backend changes (Edge Functions)

### `supabase/functions/meta-import-campaigns/index.ts`
- Adicionar à `parseActions` os tipos:
  - `post_engagement` (e variantes `page_engagement`) → `engagements`
  - `frequency` já vem em insights — capturar.
- Salvar novas colunas em `campaigns`: `engagements` (já não existe — usar JSONB? não — adicionar coluna numérica via migration).
- Reaproveitar `frequency` (já existe na tabela).

### `supabase/functions/meta-import-adsets/index.ts` e `meta-import-creatives/index.ts`
- Mesmo tratamento: incluir `engagements` e garantir `frequency`, `link_clicks`, `messages`, `revenue`, `purchases` no payload.

### `supabase/functions/meta-campaign-insights/index.ts`
- Retornar também `engagements` e `frequency` no `result[campaign_id]`, além de `cost_per_engagement = spend/engagements`.

## Database migration

Adicionar colunas (apenas as que faltam):
- `campaigns.engagements bigint default 0`
- `ad_sets.engagements bigint default 0`, `ad_sets.frequency numeric default 0`
- `creatives.engagements bigint default 0`, `creatives.frequency numeric default 0`, `creatives.video_views bigint default 0`

## Frontend changes

### `src/lib/campaignMetrics.ts` (refatorar)
- Estender `CampaignInsights` com `engagements`, `frequency`, `cost_per_engagement`.
- Reescrever `metricsForObjective` para retornar a lista completa por objetivo conforme tabela acima.
- Filtrar células com valor zero antes de retornar (exceto Gasto, sempre exibir).
- Normalizar nomes de objetivo (uppercase + tratamento de prefixo `OUTCOME_`).

### `src/pages/ClientDetail.tsx`
- Atualizar os 3 pontos onde `metricsForObjective` é chamado para popular o `CampaignInsights` com os novos campos (`engagements`, `frequency`).
- Trocar `grid-cols-3` fixo por grid responsivo (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) já que agora pode haver até 6 métricas.
- Manter destaque visual para a célula `highlight: true`.

## Out of scope
- Não alterar o layout geral, filtros de período ou fluxo OAuth.
- Não tocar em `MetaAdsTab.tsx` (apenas conexão).

## Acceptance
- Card de campanha "Tráfego" mostra Cliques no link, CTR, CPC.
- Card de campanha "Vendas" mostra Conversões, CPA, ROAS, Receita.
- Card de campanha "Mensagens" mostra Mensagens iniciadas, Custo por Mensagem.
- Mesmo comportamento aplicado em Conjuntos de Anúncios e Criativos.
- Métricas zeradas/indisponíveis não aparecem no card.
