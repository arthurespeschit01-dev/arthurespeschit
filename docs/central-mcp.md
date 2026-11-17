# Central do Gestor MCP

Servidor remoto: **https://www.centraldogestor.site/mcp**.

Somente uma conta independente da agência pode autorizar conexões. Membros convidados e usuários exclusivos de subconta não podem criar credenciais MCP. Cada conexão recebe uma seleção explícita da agência e/ou de subcontas ativas pertencentes àquela agência, além de permissões específicas. Novas subcontas não são incluídas automaticamente. Revogação, expiração, bloqueio da identidade de agência e arquivamento da subconta são verificados no servidor.

## Conectar uma ferramenta

1. Na conta da agência, abra **Configurações → Conexões MCP** e copie a URL.
2. Na ferramenta compatível com MCP remoto por HTTP, adicione essa URL nas configurações de conectores/servidores e selecione OAuth/login.
3. Entre com a conta da agência, confira o nome da ferramenta e o domínio de retorno, selecione as contas e permissões e autorize.
4. Para interromper o acesso, use **Revogar acesso** nas configurações da Central.

Claude e ChatGPT oferecem conectores MCP em produtos/planos compatíveis; a localização e disponibilidade da opção podem variar. Clientes que só aceitam servidores locais/stdin precisam de uma ponte compatível com MCP remoto e OAuth. O servidor não depende de um provedor de IA específico.

Para clientes que aceitam cabeçalhos de autenticação, a opção **Conectar com token de acesso** gera um token de 30 dias, exibido uma única vez. Configure a mesma URL com `Authorization: Bearer SEU_TOKEN`. Não coloque tokens em URLs, no código-fonte, em prompts ou em arquivos públicos. Clientes de navegador personalizados devem usar OAuth; o servidor valida a origem contra o retorno registrado do cliente.

## Ferramentas disponíveis

| Permissão | Ferramentas |
| --- | --- |
| Sempre, dentro da conexão | `list_contexts` |
| `clients:read` | `list_clients`, `get_client` — clientes da agência, sem campos financeiros ou credenciais |
| `minutes:read` | `list_meeting_minutes`, `get_meeting_minutes` — atas dos clientes da agência |
| `minutes:write` | `create_meeting_minutes`, `update_meeting_minutes` |
| `tasks:read` | `list_tasks` |
| `tasks:write` | `create_task`, `update_task` |
| `crm:read` | `list_pipelines`, `list_leads` |
| `crm:write` | `create_lead`, `move_lead` |
| `calendar:read` | `list_appointments` |

Comece por `list_contexts`. Omita `workspace_id` para a agência; use o ID de uma subconta retornada para operar nela. Clientes e atas de clientes pertencem à agência. Tarefas, CRM e agendamentos aceitam os dois contextos. As tarefas da agência correspondem à área original de Tarefas; tarefas de subcontas usam seu próprio módulo. Agendamentos da agência incluem reservas públicas da sua conta principal.

Listagens aceitam `limit` (até 100), `offset` e, quando aplicável, `search`. Ferramentas de alteração exigem `request_id` UUID único; repita esse UUID somente com os mesmos argumentos para repetir a mesma operação sem duplicá-la. A edição de atas também exige a revisão atual. Mudanças de etapa podem disparar automações que a agência já configurou. Não há ferramentas de exclusão em massa, envio direto de WhatsApp/e-mail, leitura de tokens de integrações ou gestão financeira.

## Protocolo e autorização

- MCP Streamable HTTP, respostas JSON, operação sem sessão HTTP persistente. Inicialização compatível com versões `2025-11-25`, `2025-06-18` e `2025-03-26`.
- Discovery OAuth Protected Resource em `/.well-known/oauth-protected-resource/mcp` e `/.well-known/oauth-protected-resource`.
- Authorization Server em `/.well-known/oauth-authorization-server`, registro dinâmico em `/mcp/oauth/register`, autorização na interface `/mcp/authorize`, troca em `/mcp/oauth/token`.
- OAuth público com PKCE S256 obrigatório. Retorno registrado exato, código de cinco minutos e uso único, tokens vinculados à audiência `/mcp`, acesso OAuth de uma hora, refresh rotativo de até 30 dias, família de no máximo 90 dias. Reuso de refresh revoga a família.
- Somente hashes SHA-256 de credenciais são persistidos. O navegador nunca recebe a chave service-role. As funções de resolução e execução delegada são exclusivas do servidor e validam novamente a conta, os escopos e a propriedade de cada recurso. Não há endpoint SQL genérico.
- O CORS das rotas OAuth públicas não usa cookies. A autorização da agência usa sua sessão Supabase validada; conteúdo de perfil não concede privilégios. Conteúdo de clientes/atas é tratado como dado não confiável.

## Operação e testes

A função Supabase `central-mcp` usa `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e o `AGENCY_APP_URL` existente. Os rewrites da Vercel mantêm discovery, MCP e consentimento no domínio da Central. A verificação JWT do gateway fica desligada porque discovery/registro/troca são públicos; a função autentica separadamente a sessão da agência e os tokens MCP.

`npm run test:mcp` usa PostgreSQL real por PGlite, navegador e o SDK MCP padrão, fixado como dependência de desenvolvimento. Cobre atas, isolamento entre agências/subcontas, autorização explícita, PKCE, idempotência, conflito de revisão, revogação, refresh replay e interoperabilidade initialize/list/call. Nenhuma mensagem ou cadastro externo de cliente é enviado nos testes.
