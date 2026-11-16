import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyWorkspace } from "./useAgencyWorkspace";
import { workspaceOperation } from "@/lib/workspaceCommercial";
import { whatsappRequest } from "@/lib/whatsapp";
export function useAgencyWhatsAppConnection() {
  const { user } = useAuth();
  const context = useAgencyWorkspace();
  const settings = useQuery({
    queryKey: ["workspace-integrations", user?.id, context.data, "whatsapp"],
    enabled: !!context.data,
    queryFn: () =>
      workspaceOperation<{
        whatsapp: { enabled: boolean; transport?: "wapi" | "cloud" } | null;
      }>("integration_settings", { workspace_id: context.data }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
  const legacy = useQuery({
    queryKey: ["agency-whatsapp-configuration", user?.id],
    enabled: !!user,
    queryFn: () => whatsappRequest<{ configured: boolean }>("configuration"),
    refetchOnMount: "always",
    staleTime: 30000,
  });
  return { context, settings, legacy };
}
