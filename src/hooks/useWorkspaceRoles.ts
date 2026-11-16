import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
export interface Role {
  id: string;
  name: string;
  color: string;
  admin_total: boolean;
  permissions: Record<string, string>;
  notifications: Record<string, boolean>;
}
interface Assignment {
  user_id: string;
  role_id: string;
}
export function useWorkspaceRoles(workspace: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspace-roles", user?.id, workspace],
    queryFn: async () => {
      const [r, a] = await Promise.all([
        workspaceDb
          .from("agency_workspace_roles")
          .select("*")
          .eq("workspace_id", workspace)
          .order("name"),
        workspaceDb
          .from("agency_workspace_member_roles")
          .select("user_id,role_id")
          .eq("workspace_id", workspace),
      ]);
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      return { roles: r.data as Role[], assignments: a.data as Assignment[] };
    },
  });
}
