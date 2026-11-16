import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { whatsappRequest } from "@/lib/whatsapp";
import { type WorkspaceStage } from "@/lib/clientWorkspaces";
import WorkspaceIntegrations from "./pilot/WorkspaceIntegrations";
import AgencyWhatsApp from "./AgencyWhatsApp";
export default function AgencyWhatsAppSettings({
  workspace,
  stages,
  manage,
}: {
  workspace: string;
  stages: WorkspaceStage[];
  manage: boolean;
}) {
  const { user } = useAuth();
  const [showLegacy, setShowLegacy] = useState(false);
  const legacy = useQuery({
    queryKey: ["agency-whatsapp-configuration", user?.id],
    enabled: manage,
    queryFn: () => whatsappRequest<{ configured: boolean }>("configuration"),
    staleTime: 30000,
  });
  return (
    <div className="space-y-5">
      <WorkspaceIntegrations
        workspace={workspace}
        stages={stages}
        manage={manage}
        primary
      />
      {legacy.data?.configured && (
        <details
          className="rounded-xl border p-4"
          open={showLegacy}
          onToggle={(e) => setShowLegacy(e.currentTarget.open)}
        >
          <summary className="cursor-pointer font-medium">
            Conexão anterior da Central
          </summary>
          <p className="text-sm text-muted-foreground my-3">
            Sua conexão atual e o histórico continuam preservados. Gerencie este
            número aqui; as novas conexões usam as opções acima.
          </p>
          {showLegacy && <AgencyWhatsApp />}
        </details>
      )}
    </div>
  );
}
