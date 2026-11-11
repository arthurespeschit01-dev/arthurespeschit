export interface Appointment {
 id: string; user_id: string; client_id: string | null; title: string;
 starts_at: string; ends_at: string; notes: string;
 status: 'agendado' | 'concluido' | 'cancelado'; created_at: string;
}
export function localDateTime(value: string) {
 const date = new Date(value);
 return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
