export type PipelineArea = "comercial" | "operacao";
export interface Pipeline {
  id: string;
  name: string;
  area: PipelineArea;
  revision: number;
}
export interface Stage {
  id: string;
  name: string;
  color: string;
  position: number;
  outcome?: "in_progress" | "completed" | "won" | "lost" | null;
  pipeline_id: string;
}
export interface PipelineCard {
  whatsapp_account_id?:string|null;
  id: string;
  pipeline_id: string;
  stage_id: string;
  client_id: string | null;
  title: string;
  phone: string;
  notes: string;
  value: number;
  contact_status:
    | "novo"
    | "aguardando_cliente"
    | "aguardando_agencia"
    | "respondido";
  meeting_at: string | null;
  updated_at: string;
  created_at?: string;
}
export const CONTACT_LABELS = {
  novo: "Sem contato",
  aguardando_cliente: "Aguardando cliente",
  aguardando_agencia: "Aguardando nossa resposta",
  respondido: "Respondido",
};
export const DEFAULT_STAGES = {
  comercial: [
    "Novo contato",
    "Em conversa",
    "Reunião",
    "Proposta",
    "Ganho",
    "Perdido",
  ],
  operacao: [
    "Entrada",
    "Formulário enviado",
    "Briefing recebido",
    "Briefing analisado",
    "Em execução",
    "Concluído",
  ],
};

export function validateStages(stages: Pick<Stage, "id" | "name" | "color">[]) {
  if (!stages.length || stages.length > 40)
    return "A pipeline precisa ter entre 1 e 40 etapas.";
  if (stages.some((s) => !s.name.trim() || s.name.trim().length > 80))
    return "Dê um nome de até 80 caracteres a cada etapa.";
  if (new Set(stages.map((s) => s.id)).size !== stages.length)
    return "Há etapas duplicadas.";
  if (stages.some((s) => !/^#[\da-f]{6}$/i.test(s.color)))
    return "Escolha uma cor válida para cada etapa.";
  return null;
}

export function stageOutcome(stage: Pick<Stage, 'name' | 'outcome'>) {
  if (stage.outcome) return stage.outcome;
  const name = stage.name.trim().toLocaleLowerCase('pt-BR');
  if (['concluído','concluido','concluída','concluida','finalizado','finalizada'].includes(name)) return 'completed';
  if (['ganho','ganha','venda','vendido','fechado'].includes(name)) return 'won';
  if (['perdido','perdida'].includes(name)) return 'lost';
  return 'in_progress';
}
