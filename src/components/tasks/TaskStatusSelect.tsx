import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {taskStatuses,taskStatusColors} from '@/lib/tasks';
export function TaskStatusSelect({value,onChange,label,disabled=false}:{value:string;onChange:(value:string)=>void;label:string;disabled?:boolean}){
 return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="min-h-11 w-full border-0 text-xs font-semibold" style={taskStatusColors[value]}><SelectValue/></SelectTrigger><SelectContent>{Object.entries(taskStatuses).map(([key,text])=><SelectItem key={key} value={key} style={taskStatusColors[key]} className="my-1 min-h-11 font-medium focus:ring-2 focus:ring-ring focus:ring-inset">{text}</SelectItem>)}</SelectContent></Select>;
}
