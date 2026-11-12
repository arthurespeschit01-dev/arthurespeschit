export const TICKET_CATEGORIES = {
  trafego: "Tráfego",
  design: "Design",
  sugestao: "Sugestão",
  reclamacao: "Reclamação",
  outro: "Outro",
};
export const TICKET_STATUSES = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  concluido: "Concluído",
};
export interface ClientPortal {
  id: string;
  user_id: string;
  client_id: string;
  token: string;
  enabled: boolean;
  created_at: string;
}
export interface Ticket {
  id: string;
  user_id: string;
  client_id: string;
  portal_id: string;
  title: string;
  category: keyof typeof TICKET_CATEGORIES;
  description: string;
  status: keyof typeof TICKET_STATUSES;
  created_at: string;
  updated_at: string;
}
export interface TicketMessage {
  id: string;
  user_id: string;
  ticket_id: string;
  sender: "cliente" | "agencia";
  body: string;
  created_at: string;
}
export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "date" | "number" | "select";
  options?: string[];
  condition?: {fieldId:string;operator:"equals"|"not_equals"|"contains"|"filled"|"not_filled";value?:string};
  required: boolean;
}
export interface AgencyForm {
  id: string;
  user_id: string;
  title: string;
  description: string;
  fields: FormField[];
  token: string;
  enabled: boolean;
  created_at: string;
}
export interface FormResponse {
  id: string;
  user_id: string;
  form_id: string;
  answers: Record<string, { label: string; value: string }>;
  created_at: string;
}
export const agencySelectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm w-full";
