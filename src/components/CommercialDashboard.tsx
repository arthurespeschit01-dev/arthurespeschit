import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { readAllRows } from '@/lib/readAllRows';
import { type Pipeline, type PipelineCard, type Stage } from '@/lib/pipelines';
import { conversationMetrics, pipelineMetrics, inPeriod, phoneKey, type CommercialMessage } from '@/lib/commercialMetrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { agencySelectClass } from '@/lib/agency';
import { ArrowUpRight, MessageSquare, RefreshCw } from 'lucide-react';
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateValue=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function Metric({label,value,note,color}:{label:string;value:React.ReactNode;note?:string;color?:string}) {
 return <article className="rounded-2xl border bg-card p-5 min-h-28 relative overflow-hidden"><span className="absolute top-5 right-5 text-muted-foreground"><ArrowUpRight size={16}/></span><p className="text-sm text-muted-foreground pr-5">{label}</p><p className="text-2xl font-semibold mt-3 tabular-nums" style={color?{color}:undefined}>{value}</p>{note && <p className="text-xs text-muted-foreground mt-2">{note}</p>}</article>;
}
export default function CommercialDashboard() {
 const {user}=useAuth();
 const [pipelines,setPipelines]=useState<Pipeline[]>([]),[stages,setStages]=useState<Stage[]>([]),[cards,setCards]=useState<PipelineCard[]>([]),[messages,setMessages]=useState<CommercialMessage[]>([]);
 const [clients,setClients]=useState<{id:string;status:string}[]>([]);
 const [selected,setSelected]=useState('all');
 const [start,setStart]=useState(()=>dateValue(new Date(new Date().getFullYear(),new Date().getMonth(),1)));
 const [end,setEnd]=useState(()=>dateValue(new Date()));
 const [inactive,setInactive]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{
  if(!user)return;setBusy(true);
  const [p,s,c,m,cl]=await Promise.all([
   readAllRows<Pipeline>((a,b)=>supabase.from('agency_pipelines').select('*').eq('user_id',user.id).eq('area','comercial').order('created_at').order('id').range(a,b)),
   readAllRows<Stage>((a,b)=>supabase.from('agency_pipeline_stages').select('*').eq('user_id',user.id).order('position').order('id').range(a,b)),
   readAllRows<PipelineCard>((a,b)=>supabase.from('agency_pipeline_cards').select('*').eq('user_id',user.id).order('created_at').order('id').range(a,b)),
   readAllRows<CommercialMessage>((a,b)=>supabase.from('agency_whatsapp_messages').select('id,user_id,phone_key,direction,status,created_at').eq('user_id',user.id).order('created_at').order('id').range(a,b)),
   readAllRows<{id:string;status:string}>((a,b)=>supabase.from('clients').select('id,status').eq('user_id',user.id).order('id').range(a,b)),
  ]);
  setBusy(false);if(p.error||s.error||c.error||m.error||cl.error){setError('Não foi possível carregar os indicadores. Tente atualizar.');return;}
  setError('');setPipelines(p.data);setStages(s.data);setCards(c.data);setMessages(m.data);setClients(cl.data);
 },[user]);
 useEffect(()=>{void load()},[load]);
 const pipelineIds=useMemo(()=>new Set(pipelines.filter(p=>selected==='all'||p.id===selected).map(p=>p.id)),[pipelines,selected]);
 const scope=cards.filter(c=>pipelineIds.has(c.pipeline_id) && (inactive || !c.client_id || clients.some(cl=>cl.id===c.client_id && cl.status==='Ativo')));
 const periodCards=scope.filter(c=>inPeriod(c.created_at,start,end));
 const boardStages=stages.filter(s=>pipelineIds.has(s.pipeline_id)).sort((a,b)=>a.pipeline_id.localeCompare(b.pipeline_id)||a.position-b.position);
 const metrics=pipelineMetrics(periodCards,boardStages);
 const phones=new Set(scope.map(c=>phoneKey(c.phone)).filter(Boolean));
 const eligibleMessages=messages.filter(m=>selected==='all' ? inactive || !cards.some(c=>phoneKey(c.phone)===m.phone_key && c.client_id && clients.some(cl=>cl.id===c.client_id && cl.status!=='Ativo')) : phones.has(m.phone_key));
 const whatsapp=conversationMetrics(eligibleMessages,start,end);
 const invalidDates=!!(start&&end&&start>end);
 return <div className="space-y-6">
  <div className="flex justify-between gap-4 flex-wrap items-end"><div><h1 className="text-2xl font-bold">Dashboard Comercial</h1><p className="text-sm text-muted-foreground mt-1">Visão das oportunidades e conversas da sua agência.</p></div><div className="flex gap-3 flex-wrap items-end">
   <div className="space-y-1"><Label htmlFor="commercial-start">De</Label><Input className="w-auto" id="commercial-start" type="date" value={start} onChange={e=>setStart(e.target.value)}/></div>
   <div className="space-y-1"><Label htmlFor="commercial-end">Até</Label><Input className="w-auto" id="commercial-end" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
   <div className="space-y-1"><Label htmlFor="commercial-pipeline">Pipeline comercial</Label><select id="commercial-pipeline" className={`${agencySelectClass} min-w-44`} value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Todas as pipelines</option>{pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
   <Button variant="outline" disabled={busy} onClick={()=>void load()} aria-label="Atualizar dashboard comercial"><RefreshCw size={16}/></Button>
  </div></div>
  <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>Incluir clientes pausados e encerrados</label>
  {error && <p role="alert" className="border border-destructive/40 rounded-xl p-4">{error}</p>}
  {busy ? <p role="status">Carregando indicadores…</p> : invalidDates ? <p role="alert">A data final deve ser igual ou posterior à inicial.</p> : !error && <Tabs defaultValue="funil">
   <TabsList><TabsTrigger value="funil">Funil de vendas</TabsTrigger><TabsTrigger value="whatsapp"><MessageSquare size={14} className="mr-2"/>Conversas do WhatsApp</TabsTrigger></TabsList>
   <TabsContent value="funil" className="space-y-6 mt-6">
    <p className="text-xs text-muted-foreground">Cards criados no período selecionado, agrupados pela etapa atual. Vendas e perdas seguem os tipos de etapa configurados no CRM.</p>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><Metric label="Oportunidades" value={metrics.total}/><Metric label="Valor das oportunidades" value={money(metrics.value)}/><Metric label="Vendas ganhas" value={metrics.won}/><Metric label="Valor ganho" value={money(metrics.revenue)}/></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-label="Indicadores por etapa">{metrics.stages.map(s=><Metric key={s.id} label={s.name} value={s.count} note={`${pipelines.find(p=>p.id===s.pipeline_id)?.name} · ${money(s.value)}`} color={s.color}/>)}</div>
    {!pipelines.length && <div className="rounded-xl border border-dashed p-8 text-center"><p>Crie sua primeira pipeline no CRM para acompanhar as etapas aqui.</p><Button asChild className="mt-4"><Link to="/comercial/crm">Abrir CRM</Link></Button></div>}
    {!!boardStages.length && <div className="grid lg:grid-cols-[2fr_1fr] gap-5"><section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold mb-5">Distribuição das oportunidades</h2><div className="space-y-4">{metrics.stages.map(s=><div key={s.id}><div className="flex justify-between text-sm gap-4"><span>{s.name}{selected==='all'?` · ${pipelines.find(p=>p.id===s.pipeline_id)?.name}`:''}</span><strong>{s.count}</strong></div><div className="mt-2 h-3 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{width:`${metrics.total?s.count/metrics.total*100:0}%`,background:s.color}}/></div></div>)}</div></section><section className="rounded-2xl border bg-card p-5 space-y-5"><h2 className="font-semibold">Resultado da pipeline</h2><Metric label="Taxa de ganho" value={`${metrics.conversion.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`} note="Vendas ganhas / oportunidades do período"/><Metric label="Oportunidades perdidas" value={metrics.lost}/><Button asChild variant="outline" className="w-full"><Link to={`/comercial/crm${selected==='all'?'':`?pipeline=${selected}`}`}>Ver pipeline no CRM</Link></Button></section></div>}
   </TabsContent>
   <TabsContent value="whatsapp" className="space-y-6 mt-6">
    <p className="text-xs text-muted-foreground">Mensagens registradas pelo WhatsApp conectado. Ao escolher uma pipeline, entram apenas os telefones vinculados aos seus cards.</p>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4"><Metric label="Conversas novas" value={whatsapp.started} note="Primeira mensagem recebida no período"/><Metric label="Mensagens recebidas" value={whatsapp.received}/><Metric label="Esperando resposta" value={whatsapp.waiting.length} note="Última mensagem recebida no período e ainda sem resposta"/><Metric label="Tempo da primeira resposta" value={whatsapp.medianResponse===null?'—':whatsapp.medianResponse<60?`${Math.round(whatsapp.medianResponse)} s`:`${Math.round(whatsapp.medianResponse/60)} min`} note={`Mediana de ${whatsapp.responseCount} conversas respondidas`}/></div>
    <div className="grid lg:grid-cols-2 gap-5"><section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold mb-5">Conversas novas por dia</h2>{Object.keys(whatsapp.daily).length ? <div className="space-y-4">{Object.entries(whatsapp.daily).map(([day,count])=><div key={day} className="flex gap-4 items-center text-sm"><span className="w-20 shrink-0">{day}</span><div className="h-4 bg-primary/80 rounded" style={{width:`${count/Math.max(...Object.values(whatsapp.daily))*75}%`}}/><strong>{count}</strong></div>)}</div>:<p className="text-sm text-muted-foreground">Nenhuma conversa nova registrada neste período.</p>}</section><section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold mb-5">Conversas esperando resposta</h2>{whatsapp.waiting.length ? <ul className="space-y-3">{whatsapp.waiting.map(phone=><li key={phone} className="flex justify-between gap-4 text-sm border-b pb-3"><span>{scope.find(c=>phoneKey(c.phone)===phone)?.title || 'Contato sem oportunidade vinculada'}</span><span className="text-muted-foreground">{scope.find(c=>phoneKey(c.phone)===phone)?.phone || phone}</span></li>)}</ul>:<p className="text-sm text-muted-foreground">Nenhuma conversa esperando resposta no período.</p>}<Button variant="outline" asChild className="mt-4"><Link to="/comercial/crm?resposta=aguardando_agencia">Ver conversas no CRM</Link></Button></section></div>
   </TabsContent>
  </Tabs>}
 </div>;
}
