import { readAllRows } from "./readAllRows";
import { workspaceDb } from "./clientWorkspaces";
import type { FormField } from "./agency";
export type CaptureField = Omit<FormField, "type"> & {
  type: FormField["type"] | "tel";
};
export interface CaptureForm {
  presentation?: import("@/components/pilot/WorkspaceFormRunner").FormPresentation;
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  fields: CaptureField[];
  contact_map: Record<string, string>;
  capture_lead: boolean;
  pipeline_id: string;
  stage_id: string;
  token: string;
  enabled: boolean;
  success_message: string;
}
export interface WorkspaceCalendar {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  timezone: string;
  availability: { days: number[]; start: string; end: string; buffer: number };
  pipeline_id: string;
  stage_id: string;
  token: string;
  enabled: boolean;
}
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  branch?: string;
}
export interface WorkspaceFlow {
  id: string;
  name: string;
  enabled: boolean;
  version: number;
  definition: {
    nodes: FlowNode[];
    edges: FlowEdge[];
    configuration_version?: number;
  };
}
export interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
}
export interface Submission {
  id: string;
  form_id: string;
  lead_id: string | null;
  form_title: string;
  answers: Record<string, { label: string; value: string }>;
  analyzed_at: string | null;
  created_at: string;
}
export interface Appointment {
  id: string;
  calendar_id: string;
  name: string;
  phone: string;
  email: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string;
  lead_id: string | null;
}
export interface FlowRun {
  id: string;
  flow_id: string;
  status: string;
  error: string | null;
  created_at: string;
  next_run_at: string;
  version: number;
}
export async function commercialData(workspace: string, manage: boolean) {
  const tables = [
    "forms",
    "form_submissions",
    "form_views",
    "calendars",
    "appointments",
    "flows",
    "flow_runs",
    "tasks",
    "notifications",
    "members",
    ...(manage ? ["invitations"] : []),
  ];
  const result = await Promise.all(
    tables.map((t) =>
      readAllRows((from, to) =>
        workspaceDb
          .from("agency_workspace_" + t)
          .select("*")
          .eq("workspace_id", workspace)
          .order(
            t === "members" ? "user_id" : t === "form_views" ? "view_id" : "id",
          )
          .range(from, to),
      ),
    ),
  );
  result.forEach((r) => {
    if (r.error) throw r.error;
  });
  return Object.fromEntries(tables.map((t, i) => [t, result[i].data || []]));
}
export async function workspaceOperation<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await workspaceDb.functions.invoke(
    "workspace-operations",
    { body: { action, ...body } },
  );
  if (error) {
    let message = "Não foi possível concluir a operação.";
    try {
      message = (await error.context.json()).error || message;
    } catch {
      /* network failure */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const publicLink = (
  type: "captura" | "reservar" | "convite-equipe",
  token: string,
) => `${window.location.origin}/${type}/${token}`;
export const dateLabel = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
export const roles: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  agent: "Atendente",
  viewer: "Somente leitura",
};
export const selectClass =
  "h-10 rounded-md border bg-background px-3 text-sm min-w-0 max-w-full";
