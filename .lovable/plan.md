## Problema

A Meta retorna `objective = OUTCOME_ENGAGEMENT` mesmo para campanhas que na prática são de **mensagens (WhatsApp/Messenger)**. Hoje o código decide as métricas só pelo `objective`, então mostra "Engajamentos / Custo por Engajamento", quando o correto seria "Mensagens / Custo por Mensagem".

A informação que diferencia isso vem do **adset**, em `optimization_goal` (ex: `CONVERSATIONS`) e `destination_type` (ex: `WHATSAPP`, `MESSENGER`), não do nível da campanha.

## Solução

Em vez de depender do nome do objetivo, **decidir as métricas pelos dados reais retornados pela Meta** (`messages`, `engagements`, `leads`, `purchases`). Esses números só são preenchidos pela ação correspondente, então são a fonte mais confiável.

### Regra de prioridade no `metricsForObjective`

Antes de cair na ramificação por `objective`, verificar:

1. Se `messages > 0` e `messages >= engagements` → **render MESSAGES** (Gasto, Alcance, Mensagens, Custo/Msg, CPM)
2. Se `purchases > 0` → **render SALES** (Gasto, Alcance, Conversões, Custo/Conv, ROAS, Receita)
3. Se `leads > 0` e o objective contém LEAD → **render LEADS**
4. Caso contrário → cair na lógica atual baseada em `objective`

Isso resolve o caso da imagem: campanha `OUTCOME_ENGAGEMENT` com `messages = 666` será renderizada corretamente como "Mensagens iniciadas / Custo por Mensagem".

### Mudança única

Apenas em `src/lib/campaignMetrics.ts`, dentro de `metricsForObjective`:
- Calcular flags `isMessages`, `isSales`, `isLeads` a partir do `ins`
- Mover a checagem dessas flags para **antes** da ramificação por `objective`
- A lógica por `objective` continua como fallback para campanhas sem dados ainda

Nenhuma migration, nenhuma mudança em edge function, nenhuma mudança no frontend ClientDetail. Os dados de `messages` e `engagements` já são importados pelo `meta-import-campaigns` (incluído no patch anterior).

## Acceptance

- Campanha `OUTCOME_ENGAGEMENT` com `messages > 0` mostra: Gasto, Alcance, **Mensagens**, **Custo/Msg**, CPM (como deve ser para a campanha de WhatsApp da imagem).
- Campanha `OUTCOME_ENGAGEMENT` com só `engagements > 0` continua mostrando Engajamentos / Custo/Engaj.
- Campanhas de outros objetivos não são afetadas.
