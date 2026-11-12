# Formulários, exclusões e financeiro

## Formulários condicionais

Campos de texto, texto longo, e-mail, data, número e lista de opções podem depender da resposta a um campo anterior. Regras disponíveis: igual, diferente, contém, preenchido e vazio. Dependências só apontam para campos anteriores, evitando ciclos. A prévia permite testar os caminhos antes de compartilhar o link.

A mesma implementação de visibilidade é usada no navegador e no servidor. Só campos visíveis são obrigatórios; respostas de caminhos ocultos são removidas antes da persistência. Alterar um formulário mantém os nomes guardados nas respostas anteriores.

## Exclusão explícita

A função `agency_delete_item` roda com as permissões de quem está conectado, confere o proprietário e executa cada exclusão em uma transação. Não aceita chamadas anônimas.

- Formulário: exclui também suas respostas e invalida o link público.
- Resposta: exclui somente a resposta escolhida.
- Agendamento: exclui o registro da agenda.
- Card e pipeline: removem os vínculos necessários, sem excluir clientes ou conversas. Excluir uma pipeline remove seus cards e etapas.
- Chamado: exclui também suas mensagens.
- Lançamento manual: remove a transação correspondente.

Os botões usam confirmação e descrevem o alcance da exclusão. Nenhuma dessas exclusões é executada por migrações nem pelos testes em produção.

## A receber

O total e os atrasos respeitam o filtro de status do cliente; por padrão entram apenas os ativos. Dívidas de pausados e encerrados continuam disponíveis nos filtros correspondentes.

Ao consultar o mês, cobranças abertas do mês atual ou de meses futuros são alinhadas ao fee atual do cliente ativo. O valor original fica em `original_amount` e a data de ajuste em `fee_adjusted_at`. Pagamentos e cobranças de meses anteriores mantêm seus valores. Repetir a consulta não duplica cobranças. Fees contratuais e receita efetivamente recebida aparecem separados.

## Navegação

Clientes → Tarefas → Conversas são acessos diretos consecutivos. Tarefas saiu de Operações; Conversas saiu do menu Comercial. As URLs existentes continuam funcionando.

## Verificação

Testes de banco cobrem exclusão atômica, permissões, retenção de clientes, ajuste de fee e preservação de pagamentos e meses anteriores. Os testes da função pública verificam campos condicionais obrigatórios, descarte de respostas ocultas e links excluídos. O navegador cobre criação e prévia no celular, confirmação/cancelamento de exclusão e o total a receber de clientes ativos.
