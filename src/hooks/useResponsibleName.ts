import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";
const personName = (value: unknown) =>
  typeof value === "string" && !value.includes("@")
    ? value.trim().slice(0, 120)
    : "";
export function useResponsibleName() {
  const { user } = useAuth();
  const profileName =
    personName(user?.user_metadata?.full_name) ||
    personName(user?.user_metadata?.name);
  const member = useQuery({
    queryKey: ["responsible-name", user?.id],
    enabled: !!user && !profileName,
    queryFn: async () => {
      const r = await workspaceDb
        .from("agency_workspace_members")
        .select("display_name")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (r.error) throw r.error;
      return r.data?.map((m) => personName(m.display_name)).find(Boolean) || "";
    },
    retry: false,
  });
  return profileName || member.data || "Minha conta";
}
