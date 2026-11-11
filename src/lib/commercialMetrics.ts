import { stageOutcome, type PipelineCard, type Stage } from '@/lib/pipelines';
export interface CommercialMessage { id:string; user_id:string; phone_key:string; direction:'entrada'|'saida'; status:string; created_at:string }
export function phoneKey(value:string) {
 let n=value.replace(/\D/g,''); if(n.length===10 || n.length===11)n='55'+n;
 return /^55\d{10,11}$/.test(n) ? n.slice(2,4)+n.slice(-8) : n;
}
export function inPeriod(value:string | undefined,start:string,end:string) {
 if(!value)return false;
 const time=new Date(value).getTime();
 return Number.isFinite(time) && (!start || time>=new Date(`${start}T00:00:00`).getTime()) && (!end || time<new Date(new Date(`${end}T00:00:00`).setDate(new Date(`${end}T00:00:00`).getDate()+1)).getTime());
}
export function pipelineMetrics(cards:PipelineCard[],stages:Stage[]) {
 const won=cards.filter(c=>stageOutcome(stages.find(s=>s.id===c.stage_id) || {name:''})==='won');
 const lost=cards.filter(c=>stageOutcome(stages.find(s=>s.id===c.stage_id) || {name:''})==='lost');
 return {total:cards.length,value:cards.reduce((n,c)=>n+Number(c.value || 0),0),won:won.length,lost:lost.length,revenue:won.reduce((n,c)=>n+Number(c.value || 0),0),conversion:cards.length ? won.length/cards.length*100 : 0,
 stages:stages.map(s=>({...s,count:cards.filter(c=>c.stage_id===s.id).length,value:cards.filter(c=>c.stage_id===s.id).reduce((n,c)=>n+Number(c.value||0),0)}))};
}
export function conversationMetrics(messages:CommercialMessage[],start:string,end:string) {
 const groups=new Map<string,CommercialMessage[]>();
 for(const m of messages)if(['recebido','enviado'].includes(m.status)){const list=groups.get(m.phone_key)||[];list.push(m);groups.set(m.phone_key,list);}
 const waiting:string[]=[];const responseTimes:number[]=[];const daily:Record<string,number>={};let started=0,received=0,sent=0;
 for(const [phone,list] of groups){
  list.sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const incoming=list.filter(m=>m.direction==='entrada');const first=incoming[0];
  if(first && inPeriod(first.created_at,start,end)){
   started++;const day=new Date(first.created_at).toLocaleDateString('pt-BR');daily[day]=(daily[day]||0)+1;
   const reply=list.find(m=>m.direction==='saida' && new Date(m.created_at)>=new Date(first.created_at));
   if(reply)responseTimes.push((new Date(reply.created_at).getTime()-new Date(first.created_at).getTime())/1000);
  }
  const last=list.at(-1);
  if(last?.direction==='entrada' && inPeriod(last.created_at,start,end))waiting.push(phone);
  received+=incoming.filter(m=>inPeriod(m.created_at,start,end)).length;
  sent+=list.filter(m=>m.direction==='saida' && inPeriod(m.created_at,start,end)).length;
 }
 responseTimes.sort((a,b)=>a-b);const mid=Math.floor(responseTimes.length/2);
 return {started,received,sent,waiting,daily,responseCount:responseTimes.length,medianResponse:responseTimes.length ? responseTimes.length%2 ? responseTimes[mid] : (responseTimes[mid-1]+responseTimes[mid])/2 : null};
}
