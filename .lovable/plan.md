## Problema

A campanha `[RECONHECIMENTO] [INSTAGRAM]` tem objetivo `OUTCOME_ENGAGEMENT` na Meta. No código atual de `src/lib/campaignMetrics.ts`, qualquer objetivo que contenha `ENGAGEMENT` cai no ramo de **Mensagens** quando há qualquer valor de `messages > 0`. Por isso o sistema mostra "Mensagens 8 / Custo/Msg R$ 55,63" em vez das métricas corretas de reconhecimento (Seguidores, Visitas no perfil, Alcance, Impressões, CPM, Frequência, CTR).

Além disso, o backend hoje **não puxa** os action_types `follow`, `page_likes`, `onsite_conversion.profile_visit` da API da Meta, então mesmo se o frontend tentasse exibir Seguidores e Visitas no perfil, o valor seria zero.

## Mudanças

### 1. Backend — extrair Seguidores e Visitas no perfil

Em **3 arquivos** (`meta-campaign-insights`, `meta-import-campaigns`, `meta-import-adsets`, `meta-import-creatives`), adicionar parsing dos seguintes `action_type`:

- `follow`, `onsite_conversion.follow`, `page_likes` → `followers`
- `onsite_conversion.profile_visit` → `profile_visits`

Calcular também `cost_per_follower = spend / followers`.

### 2. Banco — novas colunas

Adicionar em `campaigns`, `ad_sets`, `creatives`:
- `followers bigint default 0`
- `profile_visits bigint default 0`

### 3. Frontend — `src/lib/campaignMetrics.ts`

Reescrever `metricsForObjective` para usar SEMPRE o objetivo da Meta (sem detecção por nome):

- **`OUTCOME_AWARENESS` / `BRAND_AWARENESS` / `REACH`** → painel de reconhecimento
- **`OUTCOME_ENGAGEMENT` / `ENGAGEMENT` / `POST_ENGAGEMENT` / `PAGE_LIKES`** → painel de reconhecimento (mesmas métricas)
- **`MESSAGES`** → painel de mensagens (continua igual)
- **`OUTCOME_LEADS` / `LEAD_GENERATION`** → leads (igual)
- **`OUTCOME_SALES` / `CONVERSIONS` / `PURCHASE`** → vendas (igual)
- **`OUTCOME_TRAFFIC` / `LINK_CLICKS`** → tráfego (igual)

Painel de **Reconhecimento/Engajamento** (escolhido pelo usuário — opção "Mostrar TUDO"):
```
Gasto | Seguidores | Custo/Seguidor | Visitas no perfil | Engajamentos | Alcance | Impressões | CPM | Frequência | CTR
```

### 4. Tipos e tabela

- Atualizar `CampaignInsights` em `src/lib/campaignMetrics.ts` com `followers?: number; profile_visits?: number; cost_per_follower?: number`.
- Atualizar `Campaign`/`AdSet`/`Creative` em `src/components/MetaHierarchyTabs.tsx` com os mesmos campos para que `insightsFromAdSet`/`insightsFromCreative` os repassem.
- O backend `ClientDetail.tsx` já injeta o objeto `insightsByCamp` direto da função realtime — só repassa.

### 5. Reimportar dados

Após a mudança, o usuário precisa clicar em **"Importar"** dentro de cada aba (Conjuntos / Anúncios) para que os novos campos sejam preenchidos a partir da Meta. Para a aba Campanhas, os insights são lidos em tempo real, então atualiza sozinho ao trocar o período.

## Arquivos afetados

- `supabase/functions/meta-campaign-insights/index.ts`
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`
- `src/lib/campaignMetrics.ts`
- `src/components/MetaHierarchyTabs.tsx`
- `src/pages/ClientDetail.tsx` (apenas adicionar campos no `ZERO` e mapeamento)
- Migration SQL para adicionar colunas em `campaigns`, `ad_sets`, `creatives`

## Resultado esperado

A campanha `[RECONHECIMENTO] [INSTAGRAM] [16/03/26]` passará a mostrar exatamente as colunas que aparecem no Gerenciador do Meta para campanhas de reconhecimento: Seguidores, Visitas no perfil, Engajamentos, Alcance, Impressões, CPM, Frequência e CTR — com os mesmos números.
