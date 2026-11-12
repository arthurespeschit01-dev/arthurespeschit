# Entrada, cobrança e navegação

## Diagnóstico

O financeiro gerava cobranças ao abrir qualquer mês, usando apenas `payment_day`. Isso podia criar uma mensalidade anterior à entrada e ao primeiro pagamento combinado. A geração agora acontece em uma função autenticada no banco, considerando `entry_date` e `first_payment_date`, sem excluir ou reescrever mensalidades existentes.

- Entrada em 20/11, pagamento dia 15: primeiro vencimento sugerido em 15/12.
- Primeiro vencimento pode ser ajustado explicitamente pelo usuário.
- Depois do primeiro vencimento, usa o dia recorrente, limitado ao último dia de cada mês.
- Repetir o carregamento não duplica mensalidades, inclusive com solicitações simultâneas.
- Alterar datas não muda cobranças já emitidas ou pagamentos registrados.
- Clientes antigos ficam com as novas datas em branco até serem informadas, sem inventar datas de contratação.

## Organização da navegação

Referências: apresentação pública do [Chronos Dock](https://chronosdock.com/), prints enviados pelo usuário e documentação da [hierarquia do ClickUp](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy). A área autenticada do Chronos não foi acessada.

O Chronos apresenta Comercial, Operacional e Gestão como áreas integradas. O ClickUp documenta navegação hierárquica com pastas que podem ser expandidas. Aplicação à Central:

- Dashboard e Clientes permanecem diretos.
- Operações fica imediatamente abaixo de Clientes: chamados, acompanhamento, relatórios, tarefas e onboarding.
- Comercial reúne dashboard, CRM, conversas, formulários e agendamentos.
- Gestão reúne financeiro e contratos.
- Configurações reúne Processos e materiais: onboarding, estudos de caso, scripts e objeções. Ferramentas guarda UTMs.
- Configurações fica depois dos módulos, fora das ações da rotina.

O logo ocupa menos espaço; a busca revela destinos dentro de pastas fechadas; o caminho da página mostra a localização; o menu no celular abre com os nomes e fecha ao navegar. Todas as rotas anteriores continuam válidas. Nenhuma funcionalidade foi removida.

## Validação

`tests/billing-schedule-db.mjs` verifica a regra no PostgreSQL, isolamento por usuário, preservação de pagamentos e repetição da geração. O fluxo de navegador cobre criação com datas, persistência, busca de páginas e navegação no celular.
