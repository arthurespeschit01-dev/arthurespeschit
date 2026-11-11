import {useEffect,useRef} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {whatsappRequest} from '@/lib/whatsapp';
export interface WhatsAppAccountStatus{configured:boolean;connected:boolean;phone?:string|null;account_id?:string|null;sync_error?:string|null;legacy_count?:number}
export function useWhatsAppAccount(){
 const {user}=useAuth(),client=useQueryClient();
 const key=['whatsapp-active-account',user?.id];
 const result=useQuery({queryKey:key,enabled:!!user,queryFn:()=>whatsappRequest<WhatsAppAccountStatus>('status'),staleTime:1000,refetchInterval:5000,refetchIntervalInBackground:true,refetchOnMount:true,refetchOnWindowFocus:true,retry:1});
 const current=useRef('');current.current=`${result.data?.connected}:${result.data?.account_id||''}`;
 useEffect(()=>{
  if(!user)return;
  const channel=supabase.channel(`whatsapp-account-${user.id}-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'agency_whatsapp_account_state',filter:`user_id=eq.${user.id}`},event=>{
   const state=event.new as {connected?:boolean;account_id?:string|null};const next=`${state.connected}:${state.account_id||''}`;
   if(next===current.current)return;current.current=next;
   client.setQueryData<WhatsAppAccountStatus>(['whatsapp-active-account',user.id],old=>old?{...old,connected:!!state.connected,account_id:state.account_id||null,phone:null}:old);
   void client.invalidateQueries({queryKey:['whatsapp-active-account',user.id]});
  }).subscribe();
  return()=>{void supabase.removeChannel(channel)};
 },[user?.id,client]);
 return result;
}
