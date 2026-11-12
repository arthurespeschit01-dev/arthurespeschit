import {useId} from 'react';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {firstBillingDate} from '@/lib/billingSchedule';
export default function ClientBillingFields({value,onChange}:{value:{entry_date:string;first_payment_date:string;payment_day:string};onChange:(fields:Partial<typeof value>)=>void}){
 const id=useId();
 return <fieldset className="col-span-full border rounded-lg p-4 space-y-3"><legend className="px-1 text-sm font-medium">Entrada e cobrança</legend><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div><Label htmlFor={`${id}-entry`}>Data de entrada</Label><Input id={`${id}-entry`} type="date" value={value.entry_date} onChange={e=>onChange({entry_date:e.target.value,first_payment_date:firstBillingDate(e.target.value,Number(value.payment_day)||5)})}/></div>
 <div><Label htmlFor={`${id}-day`}>Dia de pagamento</Label><Input id={`${id}-day`} type="number" min={1} max={31} placeholder="Ex.: 15" value={value.payment_day} onChange={e=>onChange({payment_day:e.target.value,...(value.entry_date?{first_payment_date:firstBillingDate(value.entry_date,Number(e.target.value)||5)}:{})})}/></div>
 <div><Label htmlFor={`${id}-first`}>Primeiro vencimento</Label><Input id={`${id}-first`} type="date" min={value.entry_date||undefined} value={value.first_payment_date} onChange={e=>onChange({first_payment_date:e.target.value})}/></div>
 </div><p className="text-xs text-muted-foreground">A cobrança começa no primeiro vencimento. Depois, repete no dia de pagamento. Em meses mais curtos, vence no último dia. Pagamentos já registrados são mantidos.</p></fieldset>;
}
