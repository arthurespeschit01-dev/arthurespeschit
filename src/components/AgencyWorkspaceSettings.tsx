import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { workspaceData } from "@/lib/clientWorkspaces";
import { useAgencyWorkspace } from "@/hooks/useAgencyWorkspace";
import WorkspaceCommercial from "./pilot/WorkspaceCommercial";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
export default function AgencyWorkspaceSettings({
  section,
  commercial = false,
}: {
  section: string;
  commercial?: boolean;
}) {
  const { user } = useAuth();
  const context = useAgencyWorkspace();
  const q = useQuery({
    queryKey: ["agency-account-settings", user?.id, context.data],
    enabled: !!context.data,
    queryFn: () => workspaceData(context.data!),
  });
  if (context.isPending || q.isPending)
    return <p role="status">Carregando configurações da conta principal…</p>;
  if (context.error || q.error)
    return (
      <p role="alert">
        Não foi possível carregar as configurações.{" "}
        {context.error?.message || q.error?.message}
      </p>
    );
  const data = q.data!;
  return (
    <div className="space-y-5">
      <div className="flex justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">
          {commercial
            ? (
                {
                  formularios: "Formulários",
                  funis: "Funis e automações",
                } as Record<string, string>
              )[section] || "Comercial"
            : "Configurações da Central"}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link to={commercial ? "/comercial" : "/configuracoes"}>
              {commercial ? "Voltar ao Comercial" : "Todas as configurações"}
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/conta/${context.data}`}>Área da conta e equipe</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/comercial/crm">CRM da Central</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/comercial/formularios">Formulários da Central</Link>
          </Button>
        </div>
      </div>
      <WorkspaceCommercial
        workspace={context.data!}
        owner={data.workspace!.owner_user_id}
        section={section}
        stages={data.stages}
        manage={data.permissions.can_manage}
        write={data.permissions.can_write}
        primary
      />
    </div>
  );
}
