import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb, type WorkspacePipeline } from "@/lib/clientWorkspaces";
export function useFlowContext(workspace: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["flow-trigger-context", user?.id, workspace],
    queryFn: async () => {
      const [p, a] = await Promise.all([
        workspaceDb
          .from("agency_workspace_pipelines")
          .select("id,name,workspace_id")
          .eq("workspace_id", workspace),
        workspaceDb
          .from("agency_workspace_whatsapp_accounts")
          .select("id,phone")
          .eq("workspace_id", workspace),
      ]);
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      return {
        pipelines: p.data as WorkspacePipeline[],
        accounts: a.data as { id: string; phone: string }[],
      };
    },
    refetchOnMount: "always",
  });
}
