Identifiquei a causa do erro no caso do print: a campanha aparece no banco como `OUTCOME_ENGAGEMENT`, mas os conjuntos vinculados dessa campanha estão com `optimization_goal = CONVERSATIONS`. Ou seja, no modelo atual da Meta, “Mensagens/WhatsApp” pode vir dentro do objetivo amplo `OUTCOME_ENGAGEMENT`; usar somente o objetivo da campanha não é granular o suficiente para diferenciar “engajamento comum” de “mensagens”. A correção precisa continuar sem usar nome da campanha, mas deve usar os campos oficiais da Meta no nível correto.

Plano de correção:

1. Criar uma classificação oficial de tipo de métrica Meta
   - Centralizar a regra em uma função única, usada por campanhas, conjuntos e anúncios.
   - Não usar nome da campanha, nome do conjunto ou nome do anúncio.
   - Classificar como “Mensagens” quando os campos oficiais indicarem isso, principalmente:
     - objetivo legado contendo `MESSAGES`;
     - `optimization_goal = CONVERSATIONS` nos conjuntos;
     - campos oficiais de destino/mensagem quando disponíveis, como WhatsApp, Instagram Direct ou Messenger.
   - Classificar `OUTCOME_ENGAGEMENT` sozinho como “engajamento/reconhecimento” somente quando não houver configuração oficial de mensagens nos conjuntos.

2. Corrigir a exibição de métricas para campanhas de mensagens
   - Para campanhas de mensagens, exibir métricas de mensagem em vez de engajamento genérico:
     - Gasto
     - Alcance
     - Impressões
     - CPM
     - Frequência
     - Mensagens
     - Custo por mensagem
     - CTR
   - Remover “Engajamentos” como métrica principal para campanhas cujo conjunto está otimizado para conversas.
   - O caso do print (`OUTCOME_ENGAGEMENT` + conjuntos `CONVERSATIONS`) passará a mostrar “Mensagens” e “Custo/Msg”, não “Engajamentos”.

3. Aplicar a mesma regra em campanhas, conjuntos e anúncios
   - Campanhas: a classificação será baseada no objetivo da campanha + configuração oficial dos conjuntos vinculados.
   - Conjuntos: usar diretamente `optimization_goal` e demais campos oficiais do próprio conjunto.
   - Anúncios: herdar a classificação oficial do conjunto ao qual o anúncio pertence, usando o `adset_id`, não o nome do anúncio.

4. Persistir campos oficiais adicionais da Meta
   - Adicionar campos no banco para guardar a classificação/otimização oficial necessária, por exemplo:
     - objetivo oficial da campanha;
     - objetivo/otimização primária da campanha derivada dos conjuntos oficiais;
     - `optimization_goal` também nos anúncios ou uma referência resolvida via conjunto;
     - campos oficiais de destino/promoted object quando retornados pela Meta.
   - Isso evita depender de texto digitado no nome e mantém consistência após importações.

5. Atualizar as funções de importação Meta
   - `meta-import-campaigns`: além de importar campanhas, buscar os conjuntos oficiais para detectar quando uma campanha `OUTCOME_ENGAGEMENT` é na prática uma campanha de mensagens.
   - `meta-import-adsets`: continuar salvando `optimization_goal`, e ampliar com campos oficiais de destino se disponíveis.
   - `meta-import-creatives`: salvar ou resolver o `optimization_goal` do conjunto pai para que os anúncios também exibam métricas corretas.
   - Manter os parâmetros de atribuição já alinhados ao Gerenciador da Meta.

6. Atualizar a função de insights em tempo real
   - Hoje a aba Campanhas busca métricas em tempo real, mas a classificação visual ainda depende do objetivo armazenado.
   - Vou ajustar a função de insights para também retornar a classificação oficial da Meta para cada campanha, considerando os conjuntos vinculados.
   - Assim, mesmo sem reimportar tudo, a aba Campanhas conseguirá identificar campanhas de mensagens corretamente pelo período selecionado.

7. Revisar o cálculo/parse das ações de mensagem
   - Manter a prioridade para `onsite_conversion.messaging_conversation_started_7d`.
   - Usar fallbacks oficiais apenas quando esse campo não vier.
   - Não somar variações do mesmo evento para evitar inflar número.
   - O número de “Mensagens” e “Custo/Msg” será calculado com base no mesmo evento oficial usado no Gerenciador.

8. Ajustar o frontend para usar a nova classificação
   - Substituir `metricsForObjective(objective, insights)` por uma função que recebe a classificação oficial resolvida.
   - Campanhas, conjuntos e anúncios usarão o mesmo motor de decisão.
   - O objetivo exibido pode continuar mostrando `OUTCOME_ENGAGEMENT`, mas as métricas exibidas serão de “Mensagens” quando a configuração oficial da Meta for conversas.

9. Conferência no caso real
   - Após implementar, usar a campanha do print como validação:
     - campanha: `01 - [ENGAJAMENTO] [WHATSAPP] [HORARIO COMERCIAL] [06/04/26]`
     - objetivo: `OUTCOME_ENGAGEMENT`
     - conjuntos: `optimization_goal = CONVERSATIONS`
   - Resultado esperado: a linha da campanha deixa de mostrar “Engajamentos” como métrica principal e passa a mostrar “Mensagens” e “Custo/Msg”, com os dados vindos das actions oficiais da Meta.

Arquivos que serão alterados:

- `src/lib/campaignMetrics.ts`
- `src/components/MetaHierarchyTabs.tsx`
- `src/pages/ClientDetail.tsx`
- `supabase/functions/meta-campaign-insights/index.ts`
- `supabase/functions/meta-import-campaigns/index.ts`
- `supabase/functions/meta-import-adsets/index.ts`
- `supabase/functions/meta-import-creatives/index.ts`
- nova migration do banco para os campos oficiais necessários

Ponto principal: vou corrigir a regra para usar os campos oficiais da Meta no nível correto. Não será por nome. Para campanhas `OUTCOME_ENGAGEMENT`, a decisão entre “Engajamento” e “Mensagens” virá dos conjuntos oficiais da Meta, especialmente `optimization_goal = CONVERSATIONS`.