# Entrega do piloto — evolução a partir dos arquivos Chronos

Referência funcional: `chronos-parity-audit.md` e `chronos-parity-acceptance.md`. Esta entrega não representa conclusão de todo o catálogo desses documentos.

## Recursos desta entrega

- CRM: origem padrão persistida no servidor; seleção inicial respeita o padrão.
- CRM: visualização em lista, exportação CSV dos leads da origem selecionada e retorno ao Kanban.
- CRM: histórico das alterações dos leads a partir da instalação, antes/depois, origem sistema/membro e desfazer com verificação de conflito. A reversão gera nova auditoria e pode disparar automações das etapas/tags restauradas. O histórico não foi inventado retroativamente.
- Etapas: probabilidade, seleção das etapas exibidas no dashboard e criação configurável de tarefa de reunião com prazo. Isso cria uma tarefa, não um horário reservado em agenda.
- Funis: campos UTM, gclid/gbraid/wbraid/fbclid; operadores começa com, termina com e menor que, executados no servidor.
- Funis: exportação JSON da Central e importação com validação, limites, proteção contra ciclos e revisão em rascunho. Ligações a contas/webhooks/arquivos são removidas e referências indisponíveis são limpas. O formato proprietário do Chronos não é anunciado como compatível.
- Formulários: pastas com contadores, criação e movimentação; duplicação cria definição desativada e novo link público, sem copiar respostas.
- Dashboard: coorte por primeira mensagem recebida observada, períodos de 7/30/90 dias, canais, espera, ausência de resposta, média/mediana, contatos no CRM, ganhos atuais e distribuição diária. As respostas automáticas contam na versão atual; isso é informado na tela. Ganhos são o estado atual da coorte, não faturamento fechado no período.
- Links rastreáveis: preservação do texto do botão, links `whatsapp://`, override por botão com `data-central-link="TOKEN_DO_LINK"` e prevenção de identificadores antigos de outra plataforma ao receber um novo clique de anúncio. O usuário deve copiar novamente o código do site caso mantenha um snippet antigo instalado.

## Limites que continuam abertos

Não foram concluídos: permissões por registro/pipeline e CRUD granular; CRM com catálogo de tags, configuração completa de ficha e histórico de configuração com reversão; importação por lote do CRM; atribuição Pixel+CAPI unificada por acontecimento e credenciais por origem; telemetria de abandono por pergunta; lógica de múltiplos finais e tipos adicionais de formulário; agenda com capacidade e múltiplos intervalos; inbox com responsabilidade/não lidas/arquivo; IA noturna com revisão humana/transcrição; Lead Scoring; módulos de gestão/risco/rotina da agência; faturamento/planos/add-ons/Asaas, contratos com assinatura verificável, telefonia/carteira, push, MCP e Embedded Signup oficial.

A configuração de provedores e as aprovações externas continuam requisitos separados. Não houve envio de mensagens ou conversões de teste para clientes, cobrança ou ampliação de acesso. Os dados legados da agência permanecem na base existente; esta migração atua nas tabelas do piloto.

## Verificação

- `tests/workspace-parity-db.mjs`: PostgreSQL local, padrão por empresa, negação de escopo, pastas, histórico/reversão/conflito, operadores UTM, diagnóstico de conversas e tarefa por mudança efetiva de etapa.
- `tests/pilot-workspaces-browser.mjs`: navegador → consultas com RLS → persistência, incluindo as novas pastas/duplicação/importação/histórico, catálogo de blocos, mobile, revogação/isolamento e preservação de registros legados.
- `src/lib/workflowTransfer.test.ts` e `src/lib/trackingSite.test.ts`: arquivo inválido/cíclico, limpeza de bindings/credenciais, rascunho, texto original do botão, override e nova origem de anúncio.
- Helpers Edge: suites de tracking/webhook/expansão com respostas simuladas. Elas não homologam uma conta real da Meta/Google.
- TypeScript e build de produção.

Rollback do frontend pode esconder as novas ações; manter a migração aditiva para preservar a auditoria e os dados criados. Não apagar tabelas novas para desfazer a interface.

## Estado da publicação

Implementação e testes locais concluídos para os recursos listados nesta entrega. A migração foi inicialmente rejeitada pela revisão automática por possível impacto em outras subcontas. Uma inspeção de produção confirmou uma única subconta com proprietário no piloto habilitado e nenhuma fora desse escopo; foi adicionada uma trava de migração para esse cenário e o teste de banco passou novamente. A nova tentativa exigiu confirmação e expirou sem aprovação. Não houve aplicação da migração, publicação do frontend ou atualização da Edge Function desta entrega. A PR permanece em rascunho, aguardando liberação da migração antes do deploy dependente.
