import WhatsAppInbox from '@/components/WhatsAppInbox';
import { useLocation, useNavigate } from 'react-router-dom';
import AgencyCalendar from '@/components/AgencyCalendar';
import AgencyForms from '@/components/AgencyForms';
import CommercialDashboard from '@/components/CommercialDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PipelineBoard from '@/components/PipelineBoard';
export default function Comercial() {
 const {pathname}=useLocation();const navigate=useNavigate();
 const suffix=pathname.split('/')[2];
 const section=['crm','conversas','formularios','agendamentos'].includes(suffix) ? suffix : 'dashboard';
 return <div className="space-y-6">
  {section!=='dashboard' && <div><h1 className="text-2xl font-bold">Comercial</h1><p className="text-sm text-muted-foreground mt-1">CRM, formulários e agendamentos da sua agência.</p></div>}
  <Tabs value={section} onValueChange={value=>navigate(value==='dashboard'?'/comercial':`/comercial/${value}`)}>
   <TabsList className="flex-wrap h-auto"><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="crm">CRM</TabsTrigger><TabsTrigger value="conversas">Conversas</TabsTrigger><TabsTrigger value="formularios">Formulários</TabsTrigger><TabsTrigger value="agendamentos">Agendamentos</TabsTrigger></TabsList>
   <TabsContent value="dashboard"><CommercialDashboard/></TabsContent>
   <TabsContent value="conversas"><WhatsAppInbox/></TabsContent>
   <TabsContent value="crm"><PipelineBoard area="comercial"/></TabsContent>
   <TabsContent value="formularios"><AgencyForms/></TabsContent>
   <TabsContent value="agendamentos"><AgencyCalendar/></TabsContent>
  </Tabs>
 </div>;
}
