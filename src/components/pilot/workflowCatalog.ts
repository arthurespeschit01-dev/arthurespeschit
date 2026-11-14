export const workflowCatalog = [
  {
    group: "Quando acontecer",
    hint: "O que dá partida no funil. Todo funil precisa de um gatilho.",
    items: [
      [
        "trigger",
        "Formulário preenchido",
        "Começa quando alguém envia um formulário de captação.",
        "form_submitted",
      ],
      [
        "trigger",
        "Formulário Meta Ads",
        "Recebe o lead enviado pelo formulário de anúncio da Meta.",
        "meta_lead",
      ],
      [
        "trigger",
        "Agendamento realizado",
        "Quando um contato marca um horário na agenda.",
        "appointment_created",
      ],
      [
        "trigger",
        "Lead criado",
        "Quando um novo contato entra no CRM.",
        "lead_created",
      ],
      [
        "trigger",
        "Etapa do CRM alterada",
        "Quando um lead muda de etapa.",
        "stage_changed",
      ],
      [
        "trigger",
        "Tag adicionada",
        "Quando uma etiqueta é adicionada ao lead.",
        "tag_added",
      ],
      [
        "trigger",
        "Mensagem no WhatsApp",
        "Mensagem enviada ou recebida, com filtros de texto e direção.",
        "message_received",
      ],
      [
        "trigger",
        "Webhook externo",
        "Quando outro sistema envia um contato à URL da empresa.",
        "external_webhook",
      ],
    ],
  },
  {
    group: "Decidir e esperar",
    hint: "Separe caminhos, aguarde eventos e organize o percurso.",
    items: [
      ["stage", "Estágio padrão", "Marca uma fase para organizar o funil."],
      [
        "stage",
        "Estágio condicional",
        "Identifica uma fase; use SE/SENÃO para ramificar.",
      ],
      [
        "condition",
        "Condição SE/SENÃO",
        "Dois caminhos: um para quem atende à regra, outro para quem não atende.",
      ],
      ["wait", "Timer / Espera", "Aguarda um período antes do próximo passo."],
      [
        "wait_response",
        "Aguardar resposta",
        "Aguarda o lead responder ou o prazo terminar.",
      ],
      [
        "team_response",
        "Equipe respondeu?",
        "Verifica se a equipe respondeu no prazo definido.",
      ],
      [
        "wait_appointment",
        "Aguardar reunião",
        "Retoma antes do horário de uma reunião confirmada.",
      ],
      [
        "business_hours",
        "Dia e horário",
        "Aguarda a janela de atendimento no fuso escolhido.",
      ],
      [
        "split",
        "Dividir o fluxo",
        "Distribui contatos entre caminhos com pesos definidos.",
      ],
    ],
  },
  {
    group: "Fazer",
    hint: "Mensagens, tarefas, CRM e trabalho em equipe.",
    items: [
      [
        "send_message",
        "Enviar WhatsApp",
        "Texto ou arquivo pela instância desta empresa.",
      ],
      [
        "send_event",
        "Enviar evento (WhatsApp)",
        "Envia o convite da reunião vinculada ao contato.",
      ],
      [
        "create_group",
        "Criar grupo WhatsApp",
        "Cria um grupo vinculado ao lead.",
      ],
      [
        "add_participants",
        "Adicionar participantes ao grupo",
        "Adiciona os telefones escolhidos ao grupo do lead.",
      ],
      [
        "send_email",
        "Enviar Email",
        "Envia assunto e conteúdo pelo remetente configurado.",
      ],
      [
        "send_sms",
        "Enviar SMS",
        "Envia até 160 caracteres pela conta SMS configurada.",
      ],
      [
        "create_task",
        "Criar tarefa",
        "Cria uma tarefa com prazo para a equipe.",
      ],
      ["move_stage", "Mover no CRM", "Move o contato para outra etapa do CRM."],
      [
        "notify",
        "Notificar equipe",
        "Registra uma notificação interna para a equipe.",
      ],
      [
        "distribute",
        "Distribuir atendimento",
        "Distribui os contatos entre os atendentes selecionados.",
      ],
      [
        "assign_user",
        "Atribuir responsável",
        "Seleciona uma pessoa responsável pelo contato.",
      ],
      [
        "add_tags",
        "Editar tags do lead",
        "Adiciona etiquetas para segmentar os contatos.",
      ],
      [
        "remove_tags",
        "Remover tags do lead",
        "Remove as etiquetas selecionadas.",
      ],
      [
        "meta_event",
        "Disparar evento para o pixel",
        "Envia uma conversão à Meta usando a atribuição do lead.",
      ],
    ],
  },
];
export const flowLabels = Object.fromEntries(
  workflowCatalog.flatMap((g) => g.items.map(([type, label]) => [type, label])),
);
