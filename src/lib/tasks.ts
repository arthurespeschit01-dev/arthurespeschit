import {taskDay,isClosedTask} from '@/lib/taskViews';
export interface Task {
 id:string;title:string;description:string|null;status:string;priority:string;
 start_date:string|null;end_date:string|null;client_id:string|null;created_at:string;closed_at:string|null;
 recurrence:string;recurrence_interval:number;recurrence_days:number[];assignee_name:string;recurrence_of:string|null;assignee_user_id:string|null;area:string;recurrence_anchor:string|null;
}
export interface TaskSubtask {id:string;user_id:string;task_id:string;title:string;completed:boolean;position:number;created_at:string;updated_at:string}
export interface TaskClient {id:string;name:string;status:string|null}
export type TaskPatch={status?:string;priority?:string;end_date?:string|null;assignee_name?:string;assignee_user_id?:string|null;area?:string};
export const taskStatuses:Record<string,string>={pendente:'Pendente','em andamento':'Em Andamento','concluída':'Concluída',cancelada:'Cancelada'};
export const taskAreas=['Tráfego','Design','Edição','Conteúdo','Atendimento','Comercial','Gestão','Outros'];
export const taskStatusColors:Record<string,{backgroundColor:string;color:string}>={pendente:{backgroundColor:'#64748b',color:'#ffffff'},'em andamento':{backgroundColor:'#fbbf24',color:'#422006'},'concluída':{backgroundColor:'#34d399',color:'#052e16'},cancelada:{backgroundColor:'#fb7185',color:'#4c0519'}};
export function taskIsCurrent(task:Pick<Task,'status'|'start_date'|'end_date'>,today=taskDay(new Date().toISOString())){return !isClosedTask(task)&&(!task.start_date?(!task.end_date||task.end_date<=today):task.start_date<=today)}
export const taskScheduleDay=(task:Pick<Task,'start_date'|'end_date'>)=>task.start_date||task.end_date;
export const taskPriorities:Record<string,string>={baixa:'Baixa','média':'Média',alta:'Alta'};
export function taskDeadline(task:Pick<Task,'status'|'end_date'>,today=taskDay(new Date().toISOString())){
 if(isClosedTask(task))return 'encerrada';if(!task.end_date)return 'sem_data';if(task.end_date<today)return 'atrasada';if(task.end_date===today)return 'hoje';return 'futura';
}
export function subtaskProgress(items:Pick<TaskSubtask,'completed'>[]){const done=items.filter(s=>s.completed).length;return {done,total:items.length,percent:items.length?Math.round(done/items.length*100):0}}
export function groupTasks(tasks:Task[],groupBy:string,clients:TaskClient[]){
 const names=new Map(clients.map(c=>[c.id,c.name]));const groups=new Map<string,{key:string;label:string;tasks:Task[]}>();
 for(const task of tasks){const key=groupBy==='area'?(task.area||''):groupBy==='cliente'?(task.client_id||'none'):groupBy==='responsavel'?(task.assignee_name||''):groupBy==='prioridade'?task.priority:groupBy==='nenhum'?'all':task.status;
 const label=groupBy==='area'?(task.area||'Sem área'):groupBy==='cliente'?(names.get(key)||'Sem cliente'):groupBy==='responsavel'?(key||'Sem responsável'):groupBy==='prioridade'?(taskPriorities[key]||key):groupBy==='nenhum'?'Todas as tarefas':(taskStatuses[key]||key);
 if(!groups.has(key))groups.set(key,{key,label,tasks:[]});groups.get(key)!.tasks.push(task);}
 return [...groups.values()].sort((a,b)=>groupBy==='status'?Object.keys(taskStatuses).indexOf(a.key)-Object.keys(taskStatuses).indexOf(b.key):groupBy==='prioridade'?['alta','média','baixa'].indexOf(a.key)-['alta','média','baixa'].indexOf(b.key):a.label.localeCompare(b.label,'pt-BR'));
}
export function taskMonthDays(month:string){const first=new Date(month+'-01T12:00:00Z');first.setUTCDate(1-((first.getUTCDay()+6)%7));return Array.from({length:42},(_,i)=>{const day=new Date(first);day.setUTCDate(first.getUTCDate()+i);return day.toISOString().slice(0,10)})}
