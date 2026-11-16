import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
export function useAgencyWorkspace(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency-account-workspace", user?.id],
    enabled: enabled && !!user,
    staleTime: 300000,
    queryFn: async () => {
      const r = await workspaceDb.rpc("agency_account_workspace");
      if (r.error) throw r.error;
      return r.data as string;
    },
  });
}
