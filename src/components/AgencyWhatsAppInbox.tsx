import { useState } from "react";
import { Link } from "react-router-dom";
import { useAgencyWhatsAppConnection } from "@/hooks/useAgencyWhatsAppConnection";
import { Button } from "@/components/ui/button";
import WorkspaceConversations from "./pilot/WorkspaceConversations";
import WhatsAppInbox from "./WhatsAppInbox";
export default function AgencyWhatsAppInbox() {
  const { context, settings, legacy } = useAgencyWhatsAppConnection();
  const [selected, setSelected] = useState<"current" | "legacy" | null>(null);
  if (context.error || settings.error || legacy.error)
    return (
      <div role="alert" className="space-y-3">
        <p>Não foi possível conferir a conexão do WhatsApp. Tente novamente.</p>
        <Button
          onClick={() => {
            void context.refetch();
            void settings.refetch();
            void legacy.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  if (context.isPending || settings.isPending || legacy.isPending)
    return <p role="status">Carregando WhatsApp da Central…</p>;
  const current =
    selected ||
    (settings.data?.whatsapp || !legacy.data?.configured
      ? "current"
      : "legacy");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold">WhatsApp da Central</h1>
        <Button asChild variant="outline">
          <Link to="/configuracoes/whatsapp">Configurar WhatsApp</Link>
        </Button>
      </div>
      {legacy.data?.configured && (
        <div
          role="tablist"
          aria-label="Conexão das conversas"
          className="flex gap-2"
        >
          <Button
            role="tab"
            aria-selected={current === "current"}
            variant={current === "current" ? "default" : "outline"}
            onClick={() => setSelected("current")}
          >
            Conexão da conta · QR Code / Meta
          </Button>
          <Button
            role="tab"
            aria-selected={current === "legacy"}
            variant={current === "legacy" ? "default" : "outline"}
            onClick={() => setSelected("legacy")}
          >
            Conexão anterior e histórico
          </Button>
        </div>
      )}
      {current === "legacy" ? (
        <WhatsAppInbox />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Conversas do número conectado nesta conta, por QR Code ou API
            oficial da Meta.
          </p>
          <WorkspaceConversations
            key={context.data}
            workspace={context.data!}
            write
          />
        </>
      )}
    </div>
  );
}
