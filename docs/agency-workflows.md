# Comercial, Operação e atendimento

## Comportamento implementado

- Clientes abre em **Ativos**, com filtros separados para Pausados, Encerrados e Todos.
- Financeiro separa as listas por status. Totais, pagamentos e dívidas históricos permanecem íntegros. Novas mensalidades são geradas apenas para clientes explicitamente ativos.
- Saldo das contas e seletores de tarefas/acompanhamento excluem clientes pausados e encerrados. O filtro também é aplicado na função `meta-account-balances` antes de consultar a Meta.
- Comercial tem CRM, formulários e agendamentos. CRM e Operação compartilham um quadro com pipelines independentes por usuário e área.
- Criar e editar pipelines acontece dentro do quadro: nome, etapas, cores e ordem. Remover uma etapa com cards exige uma etapa de destino. A alteração inteira é transacional e versões concorrentes são rejeitadas.
- Cards podem ser movidos por arraste, seletor de etapa ou edição da pipeline de destino. Operação exige vínculo com um cliente. Cards vinculados a clientes pausados/encerrados ficam ocultos por padrão, com opção de exibição.
- Os indicadores comerciais usam o status registrado nos cards e são atualizados pelas mensagens do WhatsApp conectado. O código do Vértice foi usado como referência; seus leads e credenciais não foram copiados.
- Chamados permite criar um portal por cliente, copiar, desativar e substituir seu link. O cliente abre chamados e acompanha respostas sem precisar de acesso à conta interna da agência. Categorias: tráfego, design, sugestão, reclamação e outro.
- Formulários permitem criar, editar, ordenar, adicionar/remover campos, marcar obrigatoriedade, compartilhar links, desativar e consultar respostas. Tipos: texto curto/longo, e-mail, data e número. As respostas guardam os rótulos dos campos no momento do envio.
- Agenda consulta os próximos 60 dias da agenda principal do Google e cria compromissos nela. Mostra até 100 compromissos e informa quando existem mais. Datas seguem o fuso do dispositivo.

## Acesso público

Os links de portal e formulário são credenciais de acesso: devem ser enviados apenas aos destinatários. São tokens aleatórios de 64 caracteres. Links de portal podem ser substituídos sem apagar o histórico. Desativar o portal ou formulário bloqueia novas consultas/envios por aquele link.

As páginas públicas chamam `agency-portal`. Nenhuma tabela é liberada para leitura anônima. A função valida o token e deriva usuário, cliente e portal do banco; dados de identificação enviados pelo visitante não determinam a autorização. O visitante só consegue consultar chamados do próprio portal. Não há upload de anexos nesta versão.

Respostas do formulário não são expostas pelo link público. Credenciais do Google e estados OAuth não podem ser lidos por `anon` ou `authenticated`; apenas pelas funções de servidor.

## Ativação pendente

O arquivo local do repositório aponta para **ffvmmnzvmjiddqtywkko**, mas o build público de `https://www.centraldogestor.site` foi inspecionado e aponta para **dycyskikaljvokaxsxnh**. Esse é o vínculo de produção observado que deve ser preservado. As consultas administrativas aos dois projetos retornaram `You do not have permission to perform this action`. Nenhuma migração remota foi executada e nenhuma função foi publicada. Os testes usam PostgreSQL isolado e respostas simuladas dos serviços externos.

Antes de ativar:

1. Conectar o Supabase de produção **dycyskikaljvokaxsxnh** e conferir as variáveis Production do projeto Vercel que atende `www.centraldogestor.site`. Preservar a URL e a chave pública desse banco. Não substituir as variáveis Production pelos valores do arquivo local nem publicar um build pré-compilado com o projeto local diferente.
2. Conferir o histórico de migrações do projeto e aplicar as quatro migrações novas: `agency_pipelines`, `agency_portal_forms`, `agency_calendar` e `agency_whatsapp`. Não reaplicar o histórico inteiro sem comparar com o banco remoto.
3. Publicar `agency-portal`, `agency-calendar` e a atualização de `meta-account-balances`. As duas funções novas têm `verify_jwt = false` no arquivo de configuração: o portal autentica por token secreto; a agenda valida a sessão em todas as ações privadas e valida o estado de uso único no retorno OAuth.
4. No Google Cloud, ativar a Calendar API e configurar um cliente OAuth web, tela de consentimento e usuários de teste/publicação conforme o uso. URI autorizada de retorno: `https://dycyskikaljvokaxsxnh.supabase.co/functions/v1/agency-calendar?callback=1`.
5. Configurar nos segredos das funções, sem colocá-los no código/frontend: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `AGENCY_APP_URL=https://www.centraldogestor.site`. Cada usuário conecta sua própria agenda pela aba Comercial → Agendamentos.
6. Testar em um ambiente de revisão com banco correspondente, executar os advisors do Supabase e revisar o fluxo com contas distintas antes da publicação em produção. O preview do frontend não deve receber credenciais de serviço.

## Verificação

- `npm test`: regras de status e validação de respostas públicas.
- `npm run test:db`: aplica as quatro migrações em PostgreSQL isolado (PGlite), testa preservação dos cards, rollback, conflito de revisão, integridade entre pipelines, RLS, portais, chamados, formulários e proteção de credenciais.
- `npm run test:edge`: Deno, exercita os handlers reais com rede simulada. Verifica isolamento do portal, rejeição de IDs de outro cliente, estado OAuth de uso único e autenticação da agenda.
- `npm run dev` e, em outro terminal, `npm run test:browser`: Chromium/Playwright. Em máquinas com Chromium de sistema, definir `CHROMIUM_PATH`. O teste intercepta todos os acessos Supabase; as mutações das telas internas rodam contra as migrações reais em PostgreSQL isolado. Os envios das páginas públicas usam respostas simuladas, em um contexto sem login.
- `npx tsc --noEmit -p tsconfig.app.json` e `npm run build`.

A autorização real do Google, as chamadas reais à Meta e o comportamento das migrações no banco remoto ainda dependem dos acessos/configurações acima.

## Ajustes de navegação, cliente e WhatsApp

- **Operações** aparece imediatamente abaixo de Clientes e é uma categoria expansível, com Chamados, Comercial, Relatórios, Tarefas e Onboarding e execução. As pipelines são criadas e editadas no próprio quadro. Geração de Estratégia saiu da navegação e sua rota antiga redireciona para Comercial.
- Em Clientes → ficha do cliente, **Link de chamados do cliente** permite criar, copiar, abrir, desativar e substituir o link exclusivo. O atalho de chamados abre a lista filtrada para aquele cliente. É o mesmo portal da seção Chamados, sem criar históricos separados.
- Configurações contém **Conectar WhatsApp** e **Configurar instância e token**. Comercial mantém CRM, Formulários e Agendamentos. O número é escolhido no celular ao ler o QR Code; trocar o número preserva o histórico. A instância W-API deve ser dedicada à Central e configurada uma vez pela agência dentro do sistema. Não reutilizar a instância do Vértice: isso redirecionaria o webhook dela. É possível vincular o número desejado a uma instância própria para esta conexão.
- A função `agency-whatsapp` valida a sessão nas ações privadas e usa um segredo aleatório por conexão para os webhooks. Tokens ficam em tabela restrita ao servidor. O recebimento ignora grupos, eventos de status e ecos das mensagens enviadas. O histórico mostra as últimas 100 mensagens recebidas após a conexão e enviadas pela Central; não importa conversas antigas nem mensagens enviadas por outros aplicativos. Mídias recebidas aparecem como indicação de tipo; envio nesta versão é de texto.
- Abra um card salvo com telefone para conversar. Mensagens recebidas mudam o status para Aguardando nossa resposta; mensagens enviadas pela Central mudam para Aguardando cliente. Telefones brasileiros com/sem DDI ou nono dígito são associados ao mesmo contato.
- Antes de ativar WhatsApp no ambiente remoto, aplicar também `20261111152507_agency_whatsapp.sql` e publicar `agency-whatsapp` com `verify_jwt = false`: a função verifica a autenticação nas ações privadas e o segredo no webhook. A configuração inicial requer uma instância/token W-API válidos, cadastrados na interface; nunca em chat ou código.
- Testes do WhatsApp usam rede simulada. Nenhum QR real foi escaneado e nenhuma mensagem real foi enviada durante a implementação.

## Preservação da conta existente

A publicação deve manter o mesmo projeto Supabase e as mesmas configurações de autenticação/assinatura. Os arquivos de conexão, AuthContext, verificação de acesso e o arquivo de ambiente original não foram alterados. As migrações novas adicionam estruturas próprias e uma coluna calculada na tabela nova de cards, sem resetar ou copiar as tabelas antigas.

`tests/legacy-data-db.mjs` semeia uma conta existente com cliente ativo, IDs de contas de anúncios, tarefa em andamento, preferências, mensalidade paga e transação. Compara os registros após cada migração e repete as leituras com o usuário autenticado. Esse teste passou em PostgreSQL isolado; não é uma cópia nem uma validação da base real. Antes da promoção, conferir backup, histórico de migrações e leituras da conta existente no projeto de produção autorizado. Não aplicar o histórico antigo inteiro ou criar outro banco para substituir a conta atual.
