# Quadro de tarefas e histórico

Referências funcionais: [filtros do quadro ClickUp](https://help.clickup.com/hc/en-us/articles/6310208036503-Filter-tasks-in-Board-View), [personalização do quadro ClickUp](https://help.clickup.com/hc/en-us/articles/35342044832279-Customize-Board-view) e [filtros do Monday](https://support.monday.com/hc/en-us/articles/360003624660-The-Board-Filters).

## Dia a dia

Pendentes e em andamento permanecem no quadro, inclusive quando estão atrasadas. Não são descartadas nem reiniciadas quando muda a semana. As colunas de concluídas e canceladas mostram apenas a semana atual e começam recolhidas; continuam aceitando arrastar um card. Seus botões revelam a semana ou abrem todo o histórico. Os números do resumo representam o total de cada status e funcionam como atalhos.

A semana vai de segunda a domingo, considerando America/Sao_Paulo. O histórico filtra pela data real de encerramento, não pelo prazo. Oferece semana atual, anterior, mês, todos os registros, sem data e intervalo personalizado. Busca, cliente, prioridade e ordenação ajudam a localizar itens. Reabrir devolve uma tarefa para pendente, sem excluir comentários, anexos ou o registro da tarefa. No celular, as ações de status ficam sempre visíveis, sem depender de hover ou arrastar.

## Datas e preservação

O banco preenche `closed_at` quando a tarefa entra em concluída/cancelada. Editar o título ou prazo mantém a data. Reabrir remove a data do encerramento atual; encerrar novamente registra a nova data. Não é um log de todas as transições.

Tarefas antigas não recebem uma data presumida. Permanecem em “Todo o histórico” e “Sem data registrada”. A migração acrescenta a coluna e o controle de datas sem atualizar ou excluir tarefas existentes.

## Verificação

`task-history-db.mjs` testa preservação das tarefas, encerramento, edição e reabertura no PostgreSQL. `taskViews.test.ts` cobre os limites da semana, fuso e períodos. O fluxo de navegador testa quadro, histórico, conclusão, cancelamento e reabertura no celular. `TEST_TASKS_ONLY=1` executa apenas esse trecho do fluxo de navegador.
