import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';import {UserRound} from 'lucide-react';
export function TaskAssigneeSelect({value,selfId,selfName,label,onChange,disabled=false,legacyName}:{value:string|null;selfId:string;selfName:string;label:string;onChange:(id:string|null)=>void;disabled?:boolean;legacyName?:string}){
 const selected=value||(legacyName?'legacy':'none');
 return <Select value={selected} disabled={disabled} onValueChange={id=>onChange(id==='none'?null:id)}><SelectTrigger aria-label={label} className="min-h-11 w-full min-w-0 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none" className="min-h-11">Sem responsável</SelectItem><SelectItem value={selfId} className="min-h-11"><span className="flex items-center gap-2"><UserRound size={14}/>{selfName}</span></SelectItem>{legacyName&&!value&&<SelectItem disabled value="legacy">{legacyName} (anterior)</SelectItem>}</SelectContent></Select>;
}
