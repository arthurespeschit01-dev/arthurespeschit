## Causa do problema

No edge function `meta-campaign-insights`, a contagem de **mensagens** soma 4 action_types de uma vez:

```ts
'onsite_conversion.messaging_conversation_started_7d',
'onsite_conversion.total_messaging_connection',
'onsite_conversion.messaging_first_reply',
'onsite_conversion.messaging_conversation_started',
```

A Meta retorna vários desses simultaneamente para o MESMO evento — `messaging_conversation_started` e `messaging_conversation_started_7d` referem-se à mesma conversa apenas com janelas de atribuição diferentes, e `total_messaging_connection` agrega outros eventos. Isso causa **dupla/tripla contagem** de mensagens, inflando "Mensagens" e deflando o "Custo/Msg" em relação ao Gerenciador de Anúncios.

O Gerenciador da Meta exibe a coluna "Conversas iniciadas por mensagens" usando **apenas** `onsite_conversion.messaging_conversation_started_7d` (a métrica oficial padrão).

O mesmo problema afeta `engagements`, que soma `post_engagement` + `page_engagement` + reações/comentários/likes individuais — quando `post_engagement` no Meta **já é o total agregado** desses eventos. Isso gera dupla contagem de engajamento também.

## Mudanças

### 1. `supabase/functions/meta-campaign-insights/index.ts`

**Mensagens** — usar APENAS o action_type oficial do Gerenciador (com fallback se ele não vier):

```ts
let messages = 0;
let messagesFallback = 0;
for (const a of (ins.actions || [])) {
  if (a.action_type === 'onsite_conversion.messaging_conversation_started_7d') {
    messages = parseFloat(a.value || '0') || 0; // métrica oficial
  }
  if (a.action_type === 'onsite_conversion.messaging_conversation_started') {
    messagesFallback = Math.max(messagesFallback, parseFloat(a.value || '0') || 0);
  }
}
if (messages === 0) messages = messagesFallback;
```

**Engajamentos** — usar `post_engagement` se existir (já é o total agregado da Meta), senão `page_engagement`, sem somar reações individuais:

```ts
let postEng = 0, pageEng = 0;
for (const a of (ins.actions || [])) {
  if (a.action_type === 'post_engagement') postEng = parseFloat(a.value || '0') || 0;
  if (a.action_type === 'page_engagement') pageEng = parseFloat(a.value || '0') || 0;
}
const engagements = postEng > 0 ? postEng : pageEng;
```

**Leads** — manter, mas evitar dupla contagem entre `lead` e `onsite_conversion.lead_grouped`:

```ts
let leadStd = 0, leadGrouped = 0, leadPixel = 0;
for (const a of (ins.actions || [])) {
  if (a.action_type === 'lead') leadStd = v;
  if (a.action_type === 'onsite_conversion.lead_grouped') leadGrouped = v;
  if (a.action_type === 'offsite_conversion.fb_pixel_lead') leadPixel = v;
}
const leads = Math.max(leadStd, leadGrouped, leadPixel); // pega o maior, não soma
```

**Purchases** — mesma lógica (pegar o maior entre `purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase` — eles representam a mesma conversão por canais distintos).

**Revenue** — mesma lógica em `action_values` (pegar o maior).

### 2. Aplicar a mesma correção em `meta-import-campaigns/index.ts`, `meta-import-adsets/index.ts` e `meta-import-creatives/index.ts`

Essas funções persistem dados no banco com a mesma lógica defeituosa. Replicar o parsing corrigido nelas também.

## Resultado esperado

Os valores de Mensagens, Engajamentos, Leads, Conversões e Receita passarão a bater com o Gerenciador de Anúncios da Meta (tolerância pequena por janelas de atribuição). O `Custo/Msg`, `CPL`, `CPA` e `ROAS` ficam consistentes.

Métricas que já estavam corretas (Gasto, Alcance, Impressões, CPM, CTR, CPC, Frequência, Cliques no link) **não são tocadas** — o parsing delas vem direto dos campos top-level da Meta e não muda.

A heurística de seleção de objetivo em `src/lib/campaignMetrics.ts` permanece como está (correta).
