import { useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceDb } from "@/lib/clientWorkspaces";

/** Presentation only. Explicit workspace invitations never enable the agency skin. */
export default function PilotVisualTheme() {
  const { user } = useAuth();
  const identity = useQuery({
    queryKey: ["agency-visual-pilot-owner", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await workspaceDb.rpc(
        "agency_workspace_identity",
      );
      if (error) throw error;
      return (data as { pilot_owner?: boolean } | null)?.pilot_owner === true;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const enabled = !!user && identity.data === true && !identity.isError;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (enabled) root.setAttribute("data-product-skin", "pilot");
    else root.removeAttribute("data-product-skin");
    return () => root.removeAttribute("data-product-skin");
  }, [enabled, user?.id]);
  return null;
}
