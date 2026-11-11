# Comercial, Operação e atendimento

## Comportamento implementado

- Clientes abre em **Ativos**, com filtros separados para Pausados, Encerrados e Todos.
- Financeiro separa as listas por status. Totais, pagamentos e dívidas históricos permanecem íntegros. Novas mensalidades são geradas apenas para clientes explicitamente ativos.
- Saldo das contas e seletores de tarefas/acompanhamento excluem clientes pausados e encerrados. O filtro também é aplicado na função `meta-account-balances` antes de consultar a Meta.
- Comercial tem CRM, formulários e agendamentos. CRM e Operação compartilham um quadro com pipelines independentes por usuário e área.
- Criar e editar pipelines acontece dentro do quadro: nome, etapas, cores e ordem. Remover uma etapa com cards exige uma etapa de destino. A alteração inteira é transacional e versões concorrentes são rejeitadas.
- Cards podem ser movidos por arraste, seletor de etapa ou edição da pipeline de destino. Operação exige vínculo com um cliente. Cards vinculados a clientes pausados/encerrados ficam ocultos por padrão, com opção de exibição.
- Os indicadores comerciais usam **status de resposta registrado manualmente nos cards**. Não há sincronização de mensagens com o WhatsApp nesta entrega. O código do Vértice foi usado como referência; seus leads e credenciais não foram copiados.
- Chamados permite criar um portal por cliente, copiar, desativar e substituir seu link. O cliente abre chamados e acompanha respostas sem precisar de acesso à conta interna da agência. Categorias: tráfego, design, sugestão, reclamação e outro.
- Formulários permitem criar, editar, ordenar, adicionar/remover campos, marcar obrigatoriedade, compartilhar links, desativar e consultar respostas. Tipos: texto curto/longo, e-mail, data e número. As respostas guardam os rótulos dos campos no momento do envio.
- Agenda consulta os próximos 60 dias da agenda principal do Google e cria compromissos nela. Mostra até 100 compromissos e informa quando existem mais. Datas seguem o fuso do dispositivo.

## Acesso público

Os links de portal e formulário são credenciais de acesso: devem ser enviados apenas aos destinatários. São tokens aleatórios de 64 caracteres. Links de portal podem ser substituídos sem apagar o histórico. Desativar o portal ou formulário bloqueia novas consultas/envios por aquele link.

As páginas públicas chamam `agency-portal`. Nenhuma tabela é liberada para leitura anônima. A função valida o token e deriva usuário, cliente e portal do banco; dados de identificação enviados pelo visitante não determinam a autorização. O visitante só consegue consultar chamados do próprio portal. Não há upload de anexos nesta versão.

Respostas do formulário não são expostas pelo link público. Credenciais do Google e estados OAuth não podem ser lidos por `anon` ou `authenticated`; apenas pelas funções de servidor.

## Ativação pendente

O código encontrado aponta para o projeto **ffvmmnzvmjiddqtywkko**, que não está acessível pela conexão Supabase desta sessão. A consulta ao projeto retornou `You do not have permission to perform this action`. Nenhuma migração foi executada nele e nenhuma função foi publicada. Os testes usam PostgreSQL isolado e respostas simuladas dos serviços externos.

Antes de ativar:

1. Conectar o Supabase da Central do Gestor e conferir a correspondência com o domínio `www.centraldogestor.site` e as variáveis do ambiente de hospedagem.
2. Conferir o histórico de migrações do projeto e aplicar as três migrações novas: `agency_pipelines`, `agency_portal_forms` e `agency_calendar`. Não reaplicar o histórico inteiro sem comparar com o banco remoto.
3. Publicar `agency-portal`, `agency-calendar` e a atualização de `meta-account-balances`. As duas funções novas têm `verify_jwt = false` no arquivo de configuração: o portal autentica por token secreto; a agenda valida a sessão em todas as ações privadas e valida o estado de uso único no retorno OAuth.
4. No Google Cloud, ativar a Calendar API e configurar um cliente OAuth web, tela de consentimento e usuários de teste/publicação conforme o uso. URI autorizada de retorno: `https://ffvmmnzvmjiddqtywkko.supabase.co/functions/v1/agency-calendar?callback=1`.
5. Configurar nos segredos das funções, sem colocá-los no código/frontend: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `AGENCY_APP_URL=https://www.centraldogestor.site`. Cada usuário conecta sua própria agenda pela aba Comercial → Agendamentos.
6. Testar em um ambiente de revisão com banco correspondente, executar os advisors do Supabase e revisar o fluxo com contas distintas antes da publicação em produção. O preview do frontend não deve receber credenciais de serviço.

## Verificação

- `npm test`: regras de status e validação de respostas públicas.
- `npm run test:db`: aplica as três migrações em PostgreSQL isolado (PGlite), testa preservação dos cards, rollback, conflito de revisão, integridade entre pipelines, RLS, portais, chamados, formulários e proteção de credenciais.
- `npm run test:edge`: Deno, exercita os handlers reais com rede simulada. Verifica isolamento do portal, rejeição de IDs de outro cliente, estado OAuth de uso único e autenticação da agenda.
- `npm run dev` e, em outro terminal, `npm run test:browser`: Chromium/Playwright. Em máquinas com Chromium de sistema, definir `CHROMIUM_PATH`. O teste intercepta todos os acessos Supabase; as mutações das telas internas rodam contra as migrações reais em PostgreSQL isolado. Os envios das páginas públicas usam respostas simuladas, em um contexto sem login.
- `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`.

A autorização real do Google, as chamadas reais à Meta e o comportamento das migrações no banco remoto ainda dependem dos acessos/configurações acima.
