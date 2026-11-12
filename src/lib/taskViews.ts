export const isClosedTask=(task:{status:string})=>['concluída','cancelada'].includes(task.status);
export function taskDay(value:string){return new Date(value).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'})}
export function taskWeek(now=new Date(),offset=0){
 const date=new Date(taskDay(now.toISOString())+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7)+offset*7);
 const start=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);return {start,end:date.toISOString().slice(0,10)};
}
export function closedInPeriod(task:{closed_at?:string|null},period:string,from='',to='',now=new Date()){
 if(period==='todos')return true;
 if(period==='sem_data')return !task.closed_at;
 if(!task.closed_at)return false;
 const day=taskDay(task.closed_at);
 if(period==='custom')return (!from||day>=from)&&(!to||day<=to);
 if(period==='mes')return day.slice(0,7)===taskDay(now.toISOString()).slice(0,7);
 const week=taskWeek(now,period==='anterior'?-1:0);return day>=week.start&&day<=week.end;
}
