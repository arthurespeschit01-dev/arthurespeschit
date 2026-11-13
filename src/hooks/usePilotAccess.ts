import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
export function usePilotAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency-pilot-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await workspaceDb.rpc("agency_pilot_status");
      if (error) throw error;
      return data === true;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
