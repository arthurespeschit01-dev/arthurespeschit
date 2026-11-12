export const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function firstBillingDate(entry:string,day:number){
 if(!entry||!Number.isInteger(day)||day<1||day>31)return '';
 const [year,month]=entry.split('-').map(Number);let date=new Date(year,month-1,Math.min(day,new Date(year,month,0).getDate()));
 if(localDate(date)<entry)date=new Date(year,month,Math.min(day,new Date(year,month+1,0).getDate()));
 return localDate(date);
}
export function billingError(value:{entry_date:string;first_payment_date:string;payment_day:string}){
 if(value.payment_day&&(!Number.isInteger(Number(value.payment_day))||Number(value.payment_day)<1||Number(value.payment_day)>31))return 'Informe um dia de pagamento entre 1 e 31.';
 if(value.entry_date&&value.first_payment_date&&value.first_payment_date<value.entry_date)return 'O primeiro vencimento deve ser na data de entrada ou depois dela.';
 return null;
}
