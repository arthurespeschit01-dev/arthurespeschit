
## Corrigir dados reais de Campanhas, Conjuntos e Criativos da Meta

Os dados exibidos hoje são parciais e não respeitam o objetivo da campanha. As importações trazem apenas um resumo de 30 dias fixo, sem métricas por objetivo, sem insights nos conjuntos e sem insights nos criativos. Vou corrigir as três importações para puxar os dados reais do Gerenciador de Anúncios e exibir as métricas corretas por objetivo.

## O que está errado hoje

**Campanhas (`meta-import-campaigns`)**
- Período fixo `last_30d` — não bate com o que o usuário vê no Gerenciador (que normalmente usa "Máximo" ou um período selecionado).
- Só captura `lead` e `purchase`/`revenue` — ignora mensagens, conversões customizadas, link clicks, video views, alcance, frequência etc.
- Não salva: `reach`, `frequency`, `ctr`, `cpc`, `cpm`, `messages`, `link_clicks`, `video_views`.
- `cpa` é calculado só sobre leads, mesmo quando o objetivo é vendas/mensagens.

**Conjuntos (`meta-import-adsets`)**
- NÃO importa insights. Só traz nome, status e orçamento. Por isso aparecem zerados.

**Criativos (`meta-import-creatives`)**
- Provavelmente também não importa métricas por anúncio (vou confirmar).
- Sem spend/leads/compras/CTR por criativo, é impossível comparar performance.

**Frontend (`campaignMetrics.ts` + telas)**
- Já existe lógica `metricsForObjective`, mas os campos `messages`, `link_clicks`, `reach`, `cpl`, `cpm_msg`, `roas` não são preenchidos no banco — então caem sempre no fallback (CTR/CPC).

## O que vou implementar

### 1. Banco de dados (migração)
Adicionar colunas que faltam para guardar as métricas reais por objetivo:

**`campaigns`**: `reach`, `frequency`, `ctr`, `cpc`, `cpm`, `leads`, `purchases`, `revenue`, `messages`, `link_clicks`, `video_views`, `date_preset` (período usado na última sync).

**`ad_sets`**: `spend`, `impressions`, `clicks`, `reach`, `ctr`, `cpc`, `cpm`, `leads`, `purchases`, `revenue`, `messages`, `link_clicks`, `cpa`, `roas`.

**`creatives`**: `spend`, `impressions`, `clicks`, `reach`, `ctr`, `cpc`, `cpm`, `leads`, `purchases`, `revenue`, `messages`, `link_clicks`, `cpa`, `roas`.

### 2. Edge Function `meta-import-campaigns`
- Aceitar parâmetro opcional `date_preset` (`maximum`, `last_7d`, `last_30d`, `last_90d`, `this_month`, `lifetime`) — padrão `maximum` para bater com o Gerenciador.
- Expandir o parsing de `actions` e `action_values` para cobrir todos os tipos relevantes:
  - Leads: `lead`, `onsite_conversion.lead_grouped`, `offsite_conversion.fb_pixel_lead`
  - Compras: `purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`, `onsite_web_purchase`
  - Mensagens: `onsite_conversion.messaging_conversation_started_7d`, `onsite_conversion.total_messaging_connection`
  - Cliques no link: `link_click`
  - Video views: `video_view`
- Pedir campos completos ao Insights: `spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, actions, action_values`.
- Calcular `cpa` baseado no objetivo (CPL para leads, CPP para compras, custo/conversa para mensagens).

### 3. Edge Function `meta-import-adsets`
- Adicionar chamada de Insights por adset:  
  `GET /{campaign_id}/insights?level=adset&fields=...&date_preset=...`
- Mapear `adset_id` → métricas e fazer upsert no `ad_sets` com todos os campos.
- Mesmo parsing rico de actions da campanha.

### 4. Edge Function `meta-import-creatives`
- Adicionar Insights por anúncio:  
  `GET /{campaign_id}/insights?level=ad&fields=...&date_preset=...`
- Mapear `ad_id` → métricas e fazer upsert nos `creatives`.

### 5. Frontend
- **`src/lib/campaignMetrics.ts`**: garantir que `CampaignInsights` reflete os novos campos e que os mapeamentos por objetivo funcionam (já está praticamente pronto — só usar dados reais).
- **`src/components/MetaAdsTab.tsx`** (e a tela de detalhe da campanha): ler os novos campos do banco; mostrar as métricas corretas por objetivo em campanha/conjunto/criativo usando `metricsForObjective`.
- Adicionar seletor de período (Máximo / 7d / 30d / 90d / Este mês) no topo, que dispara reimportação com o `date_preset` escolhido — assim os números batem exatamente com o que o usuário ver no Gerenciador.

### 6. Validação
- Após implementar, rodar uma reimportação e comparar com o Gerenciador para confirmar paridade de números (gasto, leads/compras/conversas, CPL/ROAS/CPP).

## Arquivos afetados
- `supabase/migrations/` (nova migração com as colunas)
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`
- `src/lib/campaignMetrics.ts`
- `src/components/MetaAdsTab.tsx`
- Tela de detalhe da campanha (a confirmar no momento da implementação)
