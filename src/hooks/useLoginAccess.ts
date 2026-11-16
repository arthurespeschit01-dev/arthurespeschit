import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
export interface LoginAccess {
  central_allowed: boolean;
  workspaces: { id: string; name: string; account_kind: "client" | "agency" }[];
  invitation_path: string | null;
}
export function useLoginAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["login-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await workspaceDb.rpc("agency_login_access");
      if (r.error) throw r.error;
      return r.data as LoginAccess;
    },
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
