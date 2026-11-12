import WhatsAppInbox from '@/components/WhatsAppInbox';
import {useLocation} from 'react-router-dom';
import AgencyCalendar from '@/components/AgencyCalendar';
import AgencyForms from '@/components/AgencyForms';
import CommercialDashboard from '@/components/CommercialDashboard';
import PipelineBoard from '@/components/PipelineBoard';
export default function Comercial(){
 const section=useLocation().pathname.split('/')[2];
 if(section==='conversas')return <WhatsAppInbox/>;
 if(section==='formularios')return <AgencyForms/>;
 if(section==='agendamentos')return <AgencyCalendar/>;
 if(section==='crm')return <div className="space-y-6"><h1 className="text-2xl font-bold">CRM</h1><PipelineBoard area="comercial"/></div>;
 return <CommercialDashboard/>;
}
