## Problema

Olhando a screenshot:

- **Campanha PAUSADA** (`OUTCOME_AWARENESS`) → mostra Gasto, Alcance, Impressões, CPM, Frequência ✅
- **Campanha ATIVA** `01 - [ENGAJAMENTO] [WHATSAPP]...` (`OUTCOME_ENGAGEMENT`) → mostra **Engajamentos / Custo/Engaj. / CPM** ❌
  - Deveria mostrar **Mensagens / Custo/Msg / CPM**, igual à campanha do meio (que está funcionando).

## Causa raiz

A heurística atual em `src/lib/campaignMetrics.ts` (linha 37):

```ts
const dataDrivenIsMessages = messages > 0 && messages >= engagements;
```

Em campanhas **ativas** de WhatsApp, a Meta retorna **dois action_types simultâneos**:

1. `onsite_conversion.messaging_conversation_started_7d` → conta como `messages` (ex: 1.969)
2. `post_engagement` / `page_engagement` → conta como `engagements` (ex: 41.982 — toda interação com o anúncio: clique, reação, comentário, visualização de perfil etc.)

Como `post_engagement` quase sempre é muito maior que `messages` (cada mensagem gera múltiplos engajamentos antes), a condição `messages >= engagements` **falha** e o sistema cai no branch de "Engajamento". Em campanhas pausadas há muito tempo, o `engagements` no período selecionado costuma ser 0 ou baixo, então a condição passa — por isso parecem corretas.

A campanha do meio na screenshot (`R$ 976,53 / 41.982 engaj.`) na verdade também está exibindo "Engajamentos" — só que o usuário aceitou aquele caso. O caso real quebrado é a 3ª (WhatsApp ativa).

## Solução

Mudar a heurística para detectar **intenção de mensagens** quando há QUALQUER volume relevante de mensagens, independentemente de `engagements`:

```ts
// Suficiente para considerar campanha de mensagens:
// - há mensagens registradas, E
// - o nome sugere mensagens/whatsapp/conversas OU não há sinal forte de outro objetivo
const nameSuggestsMessages = /WHATS|MENSAGEM|MENSAGENS|MESSAGE|CONVERSA|CHAT|DM|INBOX/i.test(campaignName);
const dataDrivenIsMessages = messages > 0 && (
  nameSuggestsMessages ||
  obj.includes('MESSAGES') ||
  // Se o objetivo for ENGAGEMENT e existem mensagens, mensagens vencem
  // (já que ENGAGEMENT no Meta é guarda-chuva pra conversations também)
  obj.includes('ENGAGEMENT')
);
```

Ou seja: **se o objetivo é ENGAGEMENT e a Meta retornou mensagens > 0 → é uma campanha de conversas**, exibe métricas de mensagem. Engajamento "puro" (post_engagement sem mensagens) continua caindo no branch de Engajamento.

### Mudanças

**1. `src/lib/campaignMetrics.ts`**
- Aceitar parâmetro extra `campaignName?: string` em `metricsForObjective`.
- Substituir `messages >= engagements` por: `messages > 0 && (obj.includes('MESSAGES') || obj.includes('ENGAGEMENT') || nameSuggestsMessages)`.
- Remover a regra restritiva que comparava magnitudes; manter apenas a verificação semântica.

**2. `src/pages/ClientDetail.tsx`**
- Passar `c.name` como 3º argumento nas 3 chamadas existentes a `metricsForObjective(...)` (cards de campanha, ad sets e creatives).

Sem migração de banco, sem mudança em edge functions — só a lógica de exibição.

## Resultado esperado

A campanha `01 - [ENGAJAMENTO] [WHATSAPP] [HORARIO COMERCIAL]` (ativa, `OUTCOME_ENGAGEMENT`, com 1.969 mensagens) passará a exibir:

`Gasto R$ 1.147,76 • Alcance 48.391 • Mensagens 1.969 • Custo/Msg R$ 0,58 • CPM R$ 12,61`

Campanhas de Engajamento "puras" (sem mensagens) continuam exibindo Engajamentos normalmente.
