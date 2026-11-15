# Central do Gestor — roteiro de aceite das funcionalidades Chronos

Especificação complementar a `chronos-parity-audit.md`, 14/11/2026.

## Como usar

Cada caso deve guardar: versão testada, usuário/cargo sintético, workspace, passos, resultado no banco, resposta/recibo do provedor quando houver, erro/retry e evidência visual. Os casos abaixo são requisitos de homologação; não são uma declaração de que foram executados ou aprovados nesta análise.

Ambientes: primeiro PostgreSQL local e APIs simuladas, depois preview, por fim sandbox/conta de teste explicitamente autorizada do provedor. Dados de teste nunca entram em contas reais de clientes para demonstrar a função. Testar leitura e escrita pela API, não apenas botões. Nenhum caso autoriza cobrança, envio a clientes ou mudança de permissão em produção.

## 1. Base, equipe e permissões

| Caso | Exercício                                                                 | Resultado obrigatório                                                                                                                                             |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01  | Criar empresas A e B; criar registros e configurar integrações distintas  | Trocar empresa não reutiliza dados, credenciais, anexos, estado de editor ou cache da anterior.                                                                   |
| A02  | Convidar pessoa para A, aceitar com e-mail confirmado; tentar entrar em B | Só A é acessível; convite não concede piloto global nem acesso à agência.                                                                                         |
| A03  | Aceitar convite com outro e-mail, expirado, revogado ou reutilizado       | Negação clara; nenhuma associação indevida.                                                                                                                       |
| A04  | Cargo leitura/edição/admin em cada módulo e múltiplos cargos              | Menu, rota, consultas e operações de servidor seguem a mesma concessão.                                                                                           |
| A05  | Próprios e pipeline restrita                                              | Lista, Kanban, detalhe, pesquisa, exportação, dashboard, mensagens e arquivos não revelam registros alheios. Caso futuro: atualmente falta a capacidade granular. |
| A06  | Arquivar e restaurar empresa; desativar proprietário do piloto            | Leituras e alterações seguem o estado; jobs não enviam ações pendentes de uma empresa desabilitada.                                                               |
| A07  | Retirar membro com sessão já aberta                                       | Nova leitura/escrita negada sem depender de atualizar o menu.                                                                                                     |
| A08  | Alterar permissões com usuário que só gerencia integrações                | Não pode promover a si mesmo, administrar membros nem ler credenciais de outro workspace.                                                                         |

## 2. CRM, histórico e importação

| Caso | Exercício                                                       | Resultado obrigatório                                                                                                               |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| C01  | Criar/reordenar/renomear etapas, mover lead e salvar pipeline   | Identidades preservadas; etapas ocupadas não são removidas implicitamente; resultado em Ganho/Perda correto.                        |
| C02  | Alterar etapa pelo Kanban, ficha, automação e API               | Mesmo evento de domínio e mesma trilha de auditoria para os quatro caminhos.                                                        |
| C03  | Repetir o mesmo salvamento, duas mudanças legítimas e desfazer  | Sem evento duplicado no primeiro; as duas mudanças são distintas; desfazer registra nova ação e não sobrescreve versão concorrente. |
| C04  | Definir origem padrão e arquivar outra origem                   | Novas entradas sem origem seguem o padrão; leads antigos e histórico permanecem.                                                    |
| C05  | Importar CSV/Excel com inválidos, repetidos e lead existente    | Prévia/mapeamento e resumo de inseridos/atualizados/rejeitados; sem duplicação silenciosa.                                          |
| C06  | Desfazer lote após lead mudar de etapa                          | Reverte apenas alterações autorizadas do lote; não apaga contato preexistente; conflitos posteriores são explicitados.              |
| C07  | Criar tag com evento e verificar uso em lead/regra/funil        | Uso rastreável, exclusão protegida e um acontecimento de conversão deduplicado.                                                     |
| C08  | Configurar probabilidade, campos da ficha e etapas no dashboard | Persistência e relatórios coerentes por origem, sem apagar valores ocultados.                                                       |

## 3. Funil — opção por opção

Para **cada opção**: criar, configurar, conectar, salvar rascunho, reabrir, editar, duplicar, ativar quando válida e executar com evento real local. Salvar sem configuração deve preservar rascunho; ativar incompleto deve apresentar o erro correspondente. Inspecionar resultado persistido e execução, não só resumo do bloco.

| Bloco                   | Configuração mínima                                     | Teste específico                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formulário preenchido   | Formulário específico ou qualquer                       | Formulário errado não dispara; retry do mesmo envio não duplica execução.                                                                                                                     |
| Formulário Meta Ads     | Form ID e conta quando aplicável                        | Webhook válido entra; assinatura inválida, Página errada e recibo repetido não entram.                                                                                                        |
| Agendamento realizado   | Agenda                                                  | Agenda errada e horário recusado não disparam.                                                                                                                                                |
| Lead criado             | Pipeline/etapa/origem/tag                               | Atualizar contato existente não se passa por nova criação.                                                                                                                                    |
| Etapa do CRM alterada   | Origem e destino, etapa anterior opcional               | Mudança correta dispara; só salvar sem mudar não dispara.                                                                                                                                     |
| Tag adicionada          | Tag                                                     | Remover/repetir tag existente não equivale a nova adição.                                                                                                                                     |
| Mensagem WhatsApp       | Conta, direção, primeira/agrupada/todas, anúncio, texto | Matriz de filtros, mídia sem texto e evento repetido.                                                                                                                                         |
| Webhook externo         | URL própria, mapeamento, destino, habilitação           | Request UUID repetido idempotente; segredo rotacionado e payload inválido recusados.                                                                                                          |
| Estágio padrão          | Nome/descrição                                          | Passa adiante e registra a passagem; não exige regra inexistente.                                                                                                                             |
| Estágio condicional     | Regras e saídas                                         | Mesmo conjunto de verificações de SE/SENÃO.                                                                                                                                                   |
| SE/SENÃO                | Campo, operador, valor, E/OU                            | Igual/diferente/contém/existe/não existe/maior/começa/termina; UTM e campos de resposta; valores ausentes e múltiplas condições. Os últimos campos/operadores exigem implementação adicional. |
| Timer                   | Duração                                                 | Reiniciar worker não perde prazo; não executa antes.                                                                                                                                          |
| Aguardar resposta       | Prazo, âncora, conta, texto/direção                     | Resposta anterior à entrada não vale; resposta após prazo segue política definida; cancelamento não envia.                                                                                    |
| Equipe respondeu?       | Prazo, âncora e autoria elegível                        | Humano, automação e celular discriminados conforme regra; saídas Respondeu/Sem resposta conectadas e testadas.                                                                                |
| Aguardar reunião        | Agenda e antecedência                                   | Usa reunião confirmada; cancelamento/reagendamento recalcula ou cancela a espera.                                                                                                             |
| Dia e horário           | Dias, intervalo e fuso                                  | Final de semana, virada de dia e mudança de offset de um fuso aplicável.                                                                                                                      |
| Dividir fluxo           | Saídas nomeadas e pesos                                 | Soma 100, saídas conectadas, escolha estável por execução e distribuição conferida numa amostra.                                                                                              |
| Enviar WhatsApp         | Conta e texto/mídia                                     | Número da empresa certa; mídia autorizada; sucesso, erro e timeout ambíguo sem reenvio cego.                                                                                                  |
| Enviar evento WhatsApp  | Agenda/compromisso                                      | ICS contém horário/fuso corretos; inexistência ou cancelamento não produz convite falso.                                                                                                      |
| Criar grupo             | Nome e participantes                                    | Provedor suporta; retorno de grupo guardado; retry não cria segundo grupo.                                                                                                                    |
| Adicionar participantes | Grupo explícito ou bloco anterior                       | Só grupo autorizado; telefones normalizados; falha parcial relatada.                                                                                                                          |
| Enviar e-mail           | Remetente, destinatário, assunto e corpo                | Provedor confirma; destinatário ausente não vira sucesso; sem credencial no browser.                                                                                                          |
| Enviar SMS              | Remetente, telefone, texto e limite                     | Texto inválido recusado; cobrança/ID do provedor não duplicados após retry.                                                                                                                   |
| Criar tarefa            | Título, prazo, responsável                              | Tarefa real na empresa, aparece ao responsável e não duplica em retry.                                                                                                                        |
| Mover no CRM            | Pipeline/etapa                                          | Destino da empresa certa; limite de recursão e evento de alteração registrado.                                                                                                                |
| Notificar equipe        | Destinatários/canal e mensagem                          | Notificação real, legível só por destinatário autorizado; marcar lida funciona.                                                                                                               |
| Distribuir atendimento  | Equipe elegível e estratégia                            | Diferenciar menor carga de rodízio; concorrência, removidos e indisponíveis.                                                                                                                  |
| Atribuir responsável    | Membro                                                  | Não atribui a pessoa externa ou removida; gera notificação quando configurada.                                                                                                                |
| Adicionar tags          | Lista                                                   | Normalização, idempotência e gatilho de nova tag.                                                                                                                                             |
| Remover tags            | Lista                                                   | Só remove as escolhidas e preserva outras.                                                                                                                                                    |
| Disparar evento pixel   | Plataforma, evento, valor/atribuição                    | Aceitação do provedor, event ID, erros e deduplicação entre regras.                                                                                                                           |

Também testar grafo vazio, sem gatilho, dois gatilhos incompatíveis, ciclo, bloco órfão, aresta inexistente, ramo sem conexão e referência a formulário/etapa/pessoa de outra empresa. Não habilitar uma definição inválida por API direta.

Importação/exportação: arquivo versionado e limitado, sem segredos/tokens; rejeitar formato desconhecido com erro legível; remapear recursos específicos por destino; importar desabilitado; comparar a semântica dos grafos antes/depois. Arquivo do Chronos só será compatível se houver um contrato de formato confirmado, nunca por coincidência de nomes.

## 4. Formulários, prévia e agenda

| Caso | Exercício                                                      | Resultado obrigatório                                                                                                                  |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F01  | Abrir prévia desktop/tablet/celular e enviar nela              | Mesmo renderer e regras do publicado; nenhum lead, webhook, cobrança ou conversão real.                                                |
| F02  | Testar todos os tipos e caminhos, inclusive ocultos e finais   | Validação no servidor; resposta oculta não altera contato; erros indicam a pergunta; navegação por teclado.                            |
| F03  | Recarregar/repetir envio após timeout                          | Mesma solicitação retorna mesmo resultado; não cria outro lead/oportunidade/execução.                                                  |
| F04  | Duplicar/mover formulário e publicar                           | Novo ID/token; integrações não copiadas inadvertidamente; pasta e slug com escopo correto.                                             |
| F05  | URL com UTMs, clique e campos ocultos declarados               | Valores permitidos preservados até lead/agendamento; parâmetros não podem alterar workspace, cargo, valor ou responsável privilegiado. |
| F06  | Abrir, iniciar, avançar, abandonar e concluir                  | Views/inícios/abandono/tempo e dispositivo coerentes por sessão e período; bots não inflacionam métricas sem identificação.            |
| F07  | Submeter com consentimento e sem consentimento                 | Pixel/CAPI seguem a política; ID compartilhado para mesmo evento; scripts ausentes/bloqueados não impedem envio do formulário.         |
| F08  | Upload, agenda dentro do formulário e webhook de saída         | Recursos futuros só são concluídos após persistência, segurança dos arquivos, conflito atômico e auditoria de saída.                   |
| G01  | Duas reservas simultâneas para última vaga                     | Uma ou N conforme capacidade; nunca excede; retry idempotente.                                                                         |
| G02  | Vários intervalos, buffers antes/depois, antecedência e janela | Horários exatamente compatíveis com configuração e eventos ocupados externos.                                                          |
| G03  | Cancelar/reagendar com espera de funil e evento Google         | Ocupação, compromisso, convites e execução coerentes, com histórico.                                                                   |
| G04  | Revogar OAuth e simular falha do Google                        | Erro visível; preservar reserva local e evitar sobrescrever edição mais recente no retry.                                              |

## 5. Rastreamento completo

| Caso | Exercício                                                                 | Resultado obrigatório                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | Site → formulário → CRM → etapa → Meta                                    | Clique e evento correlacionados; recibo do Gerenciador de Eventos em modo de teste.                                                                                   |
| T02  | Site → botão WhatsApp → mensagem → CRM → Google                           | Mensagem enviada conserva referência e texto; gclid real associado; conversão elegível no feed/ingestão. `gclid=teste` só testa transporte local, não aceitação real. |
| T03  | Entrar por tráfego Meta depois de clique Google e vice-versa              | Política de toque documentada; não carregar identificador antigo da plataforma errada.                                                                                |
| T04  | Link HTTPS, whatsapp://, botão dinâmico e override por botão              | Mensagem/destino corretos; plugins não cobertos têm limitação explícita.                                                                                              |
| T05  | Lead Ads, formulário próprio, CTWA e manual                               | Payload de conversão apropriado à porta e com a referência original; lead manual não é rotulado automaticamente como anúncio.                                         |
| T06  | Pixel específico de origem/formulário, fallback de empresa e nenhum pixel | Prioridade explícita, nenhuma mistura de token/workspace; sem pixel não vira enviado.                                                                                 |
| T07  | Etapa, tag, frase, funil e IA reconhecem a mesma compra                   | Uma ocorrência comercial, sem cinco compras; segunda compra legítima gera ocorrência nova.                                                                            |
| T08  | Meta 2xx sem confirmação, 4xx, 5xx, timeout e retry                       | Status e diagnóstico corretos; ID estável; segredo não aparece no log; nenhuma afirmação de atribuição só por HTTP 200.                                               |
| T09  | Feed Google, download manual, consulta programada e rotação               | CSV válido com datas/offset, consulta não rotulada como aceita, URL antiga revogada e sem dados pessoais desnecessários.                                              |
| T10  | Registro sem gclid, com gbraid/wbraid e troca CSV/API                     | Elegibilidade correta por transporte; exclusividade e erro legível; não descartar o identificador do lead só porque não entra no CSV.                                 |
| T11  | Aguardar resultado da importação/ingestão Google                          | Diagnóstico do provedor correlacionado; rejeição não contabilizada como receita atribuída.                                                                            |
| T12  | IA: texto positivo/negativo/ambíguo, áudio, limite e revisão              | Conteúdo de mídia não inventado; dúvida vai à revisão quando disponível; aprovação/rejeição auditadas; gasto e disparos idempotentes.                                 |
| T13  | Dashboard em período/conta e visão por anúncio                            | Numeradores, denominadores e valores conciliam com conversas, leads, vendas e conversões; sem PII de conta não autorizada.                                            |

## 6. Agência e comercialização

| Caso | Exercício                                                            | Resultado obrigatório                                                                                                       |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| O01  | Ativar/pausar/avisar/inativar cliente por pedido aprovado            | Contrato, MRR e recebíveis seguem regra documentada; pagamentos históricos imutáveis.                                       |
| O02  | Templates de onboarding e tarefas recorrentes                        | Uma criação por evento/período; edição do template não reescreve histórico; atraso e responsável corretos.                  |
| O03  | Tags de serviço, áreas e rotina semanal                              | Entrada/saída de carteira coerente, executor autorizado e ranking calculado sobre a rotina exigida.                         |
| O04  | Métricas de MRR/LTV/churn/risco e carteira por gestor                | Fórmulas documentadas, histórico de status/responsável e ausência de dupla contagem.                                        |
| O05  | Cobrança externa, webhook repetido, estorno e cobrança compartilhada | Conciliação idempotente, rateio e auditoria; nunca marcar pagamento só por consultar API.                                   |
| O06  | Contrato emitido, código, assinatura e PDF                           | Snapshot, signatário, evidências, hash e status; não confundir arquivo anexado com assinatura verificada.                   |
| O07  | Plano/limite, pagamento, cancelamento, trial e reativação            | Entitlements no servidor e UI; transações repetidas/fora de ordem não duplicam vagas ou cobranças; sem apagamento de dados. |
| O08  | Conectar assistente por MCP e revogar                                | OAuth/escopos da pessoa, empresa correta, auditoria e rascunho para criações; sem acesso pelo cargo do dono.                |

## Evidência já disponível no repositório

São suites existentes a reutilizar/ampliar, não provas de cobertura de todos os casos acima:

- `tests/pilot-workspaces-db.mjs`: fronteira de subcontas e preservação da base legada.
- `tests/workspace-commercial-db.mjs`: captura, reservas, execução e convites.
- `tests/workspace-professional-db.mjs`: esperas, ações e integrações do piloto.
- `tests/workspace-trigger-config-db.mjs`: configuração de gatilhos e isolamento.
- `tests/workspace-expansion-db.mjs`: papéis, formulários e expansões de rastreamento.
- `tests/pilot-workspaces-browser.mjs`: percurso do navegador com banco local.
- `supabase/functions/_shared/workspace-*_test.ts`: comportamento de helpers/integrações com respostas simuladas.

## Portão de liberação

1. Migration aditiva revisada, teste de RLS e preservação dos registros legados.
2. Fluxo completo navegador → API → banco/fila → resposta, incluindo falha e repetição.
3. Evidência do provedor em ambiente autorizado quando necessária; pendência externa registrada como pendência.
4. UI clara nos temas claro/escuro e em telas pequenas; estados de carregamento, vazio, sucesso e erro reais.
5. Publicação limitada ao piloto; convidados continuam restritos à subconta autorizada; rollback sem apagar dados.

Nenhuma funcionalidade futura deve ser publicada apenas porque a tela parece com a referência.
