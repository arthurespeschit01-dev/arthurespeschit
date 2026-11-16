import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
export function useWorkspaceAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency-workspace-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await workspaceDb.rpc("agency_workspace_status");
      if (error) throw error;
      return data === true;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
