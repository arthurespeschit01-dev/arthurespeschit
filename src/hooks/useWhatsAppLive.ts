import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
export function useWhatsAppLive(onUpdate:()=>void){
 const {user}=useAuth();const callback=useRef(onUpdate);callback.current=onUpdate;
 const [connected,setConnected]=useState(false);
 useEffect(()=>{
  if(!user)return;let active=true;let debounce:ReturnType<typeof setTimeout>;
  const refresh=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{if(active)callback.current()},120)};
  const channel=supabase.channel(`whatsapp-${user.id}-${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'agency_whatsapp_messages',filter:`user_id=eq.${user.id}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'agency_whatsapp_chats',filter:`user_id=eq.${user.id}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'agency_pipeline_cards',filter:`user_id=eq.${user.id}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'agency_whatsapp_account_state',filter:`user_id=eq.${user.id}`},refresh)
   .subscribe(status=>{if(active){setConnected(status==='SUBSCRIBED');if(status==='SUBSCRIBED')refresh()}});
  const visible=()=>{if(!document.hidden)refresh()};
  const timer=setInterval(visible,6000);
  document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);window.addEventListener('agency-whatsapp-update',refresh);
  return()=>{active=false;clearTimeout(debounce);clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);window.removeEventListener('agency-whatsapp-update',refresh);void supabase.removeChannel(channel)};
 },[user?.id]);
 return connected;
}
