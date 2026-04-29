
# Paridade total com o Gerenciador da Meta (campanhas, conjuntos e anúncios)

Hoje a detecção já usa o `objective`, mas (a) ainda há vestígio do parâmetro `_campaignName`, e (b) as chamadas à Graph API não fixam a janela de atribuição/atribuição unificada que o Gerenciador usa por padrão — por isso números (compras, leads, mensagens, ROAS, engajamentos) não batem exatamente.

Vamos travar duas coisas: **detecção 100% por objetivo** e **chamadas à Meta com a MESMA configuração de atribuição que o Gerenciador usa**, nos três níveis (campanha, conjunto, anúncio).

---

## 1. Remover qualquer inferência por nome (frontend)

`src/lib/campaignMetrics.ts`
- Remover o parâmetro `_campaignName` da função `metricsForObjective`.
- Assinatura final: `metricsForObjective(objective: string, ins?: CampaignInsights)`.
- Mantém o switch baseado SOMENTE em `objective` (já está assim, só limpa a sobra).

`src/components/MetaHierarchyTabs.tsx`
- Atualizar `renderMetricsCells` para chamar `metricsForObjective(objective, ins)` (sem `name`).
- Os 3 chamadores (campanhas, conjuntos, anúncios) continuam passando o `objective` da campanha pai — nenhum lê o nome.

Resultado: impossível um nome influenciar quais métricas aparecem.

---

## 2. Alinhar as chamadas à Meta com o padrão do Gerenciador

O Gerenciador, por padrão, usa **atribuição unificada** com janela `7d_click,1d_view`. Sem isso, conversões (compras, leads, mensagens) e ROAS divergem.

Aplicar nas 4 edge functions, em TODA URL de `/insights`:

```
&use_unified_attribution_setting=true
&action_attribution_windows=["7d_click","1d_view"]
&action_report_time=mixed
```

Arquivos:
- `supabase/functions/meta-campaign-insights/index.ts` (campanhas em tempo real)
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`

Isso é o que faz o número da tela bater com o número que o usuário vê no Gerenciador.

---

## 3. Refatorar o `parseActions` para refletir as colunas oficiais

Hoje o parser está bom, mas vou consolidar três pontos para garantir paridade exata:

a) **Compras**: o Gerenciador soma 1 vez por evento de compra. Hoje pegamos `Math.max(purchase, omni_purchase, fb_pixel_purchase, onsite_web_purchase)`. Vamos manter, mas priorizar nesta ordem: `omni_purchase` → `purchase` → `offsite_conversion.fb_pixel_purchase` → `onsite_web_purchase`. (omni_purchase é a métrica unificada que o Gerenciador usa na coluna "Compras".)

b) **Leads**: priorizar `onsite_conversion.lead_grouped` quando existir (é o que o Gerenciador chama de "Leads"), depois `lead`, depois pixel. Sem somar.

c) **Mensagens**: já priorizamos `onsite_conversion.messaging_conversation_started_7d` (a coluna "Conversas iniciadas por mensagem"). OK.

d) **Engajamentos**: `post_engagement` é o total agregado da coluna "Engajamento da publicação" do Ads Manager. OK.

e) **Seguidores (IG)**: action_type correto é `onsite_conversion.follow`. `page_likes` é específico do Facebook, não Instagram. Atualmente fazemos Math.max — vamos manter, mas separar em duas colunas internas para diagnóstico no log.

f) **Visitas no perfil (IG)**: `onsite_conversion.profile_visit`. OK.

g) **CTR**: Meta Ads Manager mostra "CTR (todos)" — equivale ao `ctr` que já usamos. OK.

h) **CPC**: Meta usa `cpc` (custo por clique em qualquer lugar). OK.

Centralizar `parseActions` e `cpaForObjective` em um único helper para os 3 imports usarem o mesmo código (evita drift). Como edge functions Lovable não suportam imports cross-folder, vamos copiar-colar versões idênticas e validadas nos três arquivos (que é o que já fazemos), só com a melhora acima.

---

## 4. Logs de diagnóstico

Em cada import, logar para a primeira linha de cada nível:
```ts
console.log('[meta-import-campaigns] sample action_types:', (ins.actions||[]).map(a=>a.action_type));
```
Assim, se algum cliente tiver objetivo exótico (ex: `OUTCOME_LEADS` vs `LEAD_GENERATION`), conseguimos ver na hora qual action_type está vindo e ajustar o parser.

---

## 5. Não mexer

- `src/pages/ClientDetail.tsx`: já não faz inferência por nome. Sem mudanças.
- Schema do banco: as colunas `followers` e `profile_visits` já existem. Sem migração.
- `campaignMetrics.ts` switch: já é 100% por objetivo. Só remove o parâmetro `_campaignName`.

---

## Como validar (passos do usuário após o deploy)

1. Na aba **Campanhas**, selecionar o mesmo período do Gerenciador (ex.: "Últimos 30 dias").
2. Na aba **Conjuntos** e **Anúncios**, clicar em **Importar** para puxar com a nova janela de atribuição.
3. Comparar campanha por campanha. Os números devem bater **exatamente** com as colunas: Gasto, Alcance, Impressões, CPM, Frequência, Cliques no link, CTR, Resultados (seguidores/engajamento/leads/compras conforme objetivo), Custo por resultado, ROAS.

Se ainda houver divergência em alguma campanha específica, o log vai mostrar quais `action_type` a Meta está retornando para essa campanha — aí ajustamos pontualmente o mapeamento.

---

## Arquivos editados

- `src/lib/campaignMetrics.ts` (remove `_campaignName`)
- `src/components/MetaHierarchyTabs.tsx` (remove `name` da chamada)
- `supabase/functions/meta-campaign-insights/index.ts` (atribuição + parser)
- `supabase/functions/meta-import-campaigns/index.ts` (atribuição + parser + log)
- `supabase/functions/meta-import-adsets/index.ts` (atribuição + parser + log)
- `supabase/functions/meta-import-creatives/index.ts` (atribuição + parser + log)
