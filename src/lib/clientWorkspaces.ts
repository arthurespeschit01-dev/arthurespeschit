import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
export const workspaceDb = supabase as unknown as SupabaseClient;
export interface ClientWorkspace {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  created_at: string;
  owner_user_id: string;
}
export interface WorkspacePipeline {
  id: string;
  workspace_id: string;
  name: string;
}
export interface WorkspaceStage {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  kind: "open" | "won" | "lost";
}
export interface WorkspaceLead {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  phone: string;
  email: string;
  value: number;
  notes: string;
  created_at: string;
}
export const workspaceKey = (user: string | undefined, id?: string) => [
  "pilot-client-workspaces",
  user,
  id || "list",
];
export const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
export function workspaceError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (e.code === "42501") return "Você não tem permissão para esta operação.";
  if (e.code === "23503")
    return "Há leads vinculados. Mova os leads antes de remover esta etapa ou pipeline.";
  if (e.code === "23514" || e.code === "23502")
    return "Revise os campos obrigatórios e os valores informados.";
  if (e.code === "23505")
    return "Existe um registro duplicado. Confira as etapas e tente novamente.";
  return e.message?.match(
    /^(Área piloto|Sem permissão|Informe entre|Etapa não|Etapa repetida|Pipeline não|A agência|Os registros)/,
  )
    ? e.message
    : "Não foi possível concluir. Tente novamente.";
}
export async function workspaceList() {
  const { data, error } = await workspaceDb
    .from("agency_client_workspaces")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ClientWorkspace[];
}
export async function workspaceData(id: string) {
  const results = await Promise.all([
    workspaceDb
      .from("agency_client_workspaces")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    workspaceDb
      .from("agency_workspace_pipelines")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at"),
    workspaceDb
      .from("agency_workspace_stages")
      .select("*")
      .eq("workspace_id", id)
      .order("position"),
    workspaceDb
      .from("agency_workspace_leads")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false }),
  ]);
  for (const r of results) if (r.error) throw r.error;
  return {
    workspace: results[0].data as ClientWorkspace | null,
    pipelines: results[1].data as WorkspacePipeline[],
    stages: results[2].data as WorkspaceStage[],
    leads: results[3].data as WorkspaceLead[],
  };
}
