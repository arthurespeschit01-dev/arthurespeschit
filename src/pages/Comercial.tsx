import AgencyWhatsApp from "@/components/AgencyWhatsApp";
import { useSearchParams } from "react-router-dom";
import AgencyCalendar from "@/components/AgencyCalendar";
import AgencyForms from "@/components/AgencyForms";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PipelineBoard from "@/components/PipelineBoard";

export default function Comercial() {
  const [params] = useSearchParams();
  const calendarStatus = params.get("agenda");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Comercial</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe oportunidades e personalize suas pipelines diretamente no
          CRM.
        </p>
      </div>
      <Tabs defaultValue={calendarStatus ? "agenda" : "crm"}>
        <TabsList>
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="formularios">Formulários</TabsTrigger>
          <TabsTrigger value="agenda">Agendamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="crm" className="space-y-5">
          <AgencyWhatsApp />
          <PipelineBoard area="comercial" />
        </TabsContent>
        <TabsContent value="formularios">
          <AgencyForms />
        </TabsContent>
        <TabsContent value="agenda">
          {calendarStatus && (
            <p role="status" className="mb-4">
              {calendarStatus === "conectada"
                ? "Google Agenda conectado."
                : "A conexão não foi concluída. Tente conectar novamente."}
            </p>
          )}
          <AgencyCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
