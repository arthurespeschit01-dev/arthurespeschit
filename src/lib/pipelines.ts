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
  pipeline_id: string;
}
export interface PipelineCard {
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
